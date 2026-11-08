package api

import (
	"bytes"
	"compress/gzip"
	"io/fs"
	"log/slog"
	"mime"
	"net/http"
	"path"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/ppxb/miyabi/internal/domain"
)

type Dependencies struct {
	Logger         *slog.Logger
	Access         AccessGate
	Catalogue      CatalogueManager
	Metadata       MetadataManager
	Drive          DriveManager
	Offline        OfflineManager
	Monitor        SubscriptionManager
	Library        LibraryManager
	STRM           STRMRelay
	Tasks          TaskManager
	Artwork        ArtworkReader
	Maintenance    MaintenanceManager
	Network        NetworkManager
	Emby           EmbyManager
	Organize       OrganizeManager
	ActorLinks     ActorLinker
	Playback       PlaybackManager
	Subtitles      SubtitlePlayer
	Transcoder     TranscodeRelay
	Collections    CollectionManager
	EmbyLibrary    EmbyLibrary
	EmbySubtitles  SubtitleSource
	Avatars        AvatarSource
	Frontend       fs.FS
	STRMToken      string
	TrustedProxies []string
	// Lite tells the web app to hide playback; the Emby API is off then too.
	Lite bool
}

// NewRouter requires an Access gate, including when password protection is disabled.
func NewRouter(deps Dependencies) *gin.Engine {
	gin.SetMode(gin.ReleaseMode)
	router := gin.New()
	if deps.Logger == nil {
		deps.Logger = slog.Default()
	}

	if len(deps.TrustedProxies) > 0 {
		_ = router.SetTrustedProxies(deps.TrustedProxies)
	} else {
		_ = router.SetTrustedProxies(nil)
	}

	router.Use(
		requestLoggingMiddleware(deps.Logger),
		requestDiagnosticsMiddleware(),
		recoveryMiddleware(deps.Logger),
		errorMiddleware(deps.Logger),
		securityHeadersMiddleware(),
	)

	loginLimiter := newLoginRateLimiter(5, 5*time.Minute, 24*time.Hour)
	if deps.EmbyLibrary != nil {
		router.Use(newEmbyServer(deps, loginLimiter).middleware)
	}

	api := router.Group("/api", sameOriginMiddleware())

	authAPI := api.Group("/auth", noStore())
	authAPI.GET("/config", accessConfigHandler(deps.Access, deps.Lite))
	authAPI.POST("/login", accessLoginHandler(deps.Access, loginLimiter))

	// Exported .strm files keep this path; it must stay stable across releases.
	strmHandler := strmStreamHandler(deps.STRM, deps.STRMToken, deps.Access)
	api.GET("/strm/play/:fileID", noStore(), strmHandler)
	api.HEAD("/strm/play/:fileID", noStore(), strmHandler)
	api.GET("/strm/play/:fileID/*filename", noStore(), strmHandler)
	api.HEAD("/strm/play/:fileID/*filename", noStore(), strmHandler)

	protected := api.Group("", authMiddleware(deps.Access))

	settingsAPI := protected.Group("/settings", noStore())
	settingsAPI.GET("/scraping", metadataSettingsHandler(deps.Metadata))
	settingsAPI.PUT("/scraping", metadataUpdateHandler(deps.Metadata))
	settingsAPI.GET("/system", dataInfoHandler(deps.Maintenance))
	settingsAPI.DELETE("/cache", dataClearCacheHandler(deps.Maintenance))
	settingsAPI.GET("/network", networkHandler(deps.Network))
	settingsAPI.PUT("/network", networkUpdateHandler(deps.Network))
	settingsAPI.POST("/network/test", networkTestHandler(deps.Network))
	settingsAPI.GET("/emby", embyConfigHandler(deps.Emby))
	settingsAPI.PUT("/emby", embyUpdateHandler(deps.Emby))
	settingsAPI.POST("/emby/test", embyTestHandler(deps.Emby))
	settingsAPI.GET("/organize", organizeConfigHandler(deps.Organize))
	settingsAPI.PUT("/organize", organizeUpdateHandler(deps.Organize))
	settingsAPI.GET("/subscription", subscriptionSettingsGetHandler(deps.Monitor))
	settingsAPI.PUT("/subscription", subscriptionSettingsUpdateHandler(deps.Monitor))

	protected.GET("/library/movies", libraryMoviesHandler(deps.Library))
	protected.GET("/library/movies/:id", libraryMovieHandler(deps.Library))
	protected.POST("/library/movies/:id/scrape", libraryMovieScrapeHandler(deps.Library))
	protected.GET("/library/movies/:id/previews/:index", libraryPreviewHandler(deps.Library, deps.Metadata))
	protected.POST("/library/scan", libraryScanHandler(deps.Library, deps.Emby))
	protected.POST("/library/rebuild", libraryRebuildHandler(deps.Library))
	protected.GET("/library/artwork/:key", libraryArtworkHandler(deps.Artwork))
	protected.GET("/library/movies/:id/play", noStore(), playInfoHandler(deps.Playback))
	protected.PUT("/library/movies/:id/progress", saveProgressHandler(deps.Playback))
	protected.DELETE("/library/movies/:id/progress", clearProgressHandler(deps.Playback))
	protected.PUT("/library/movies/:id/played", markPlayedHandler(deps.Playback))
	protected.GET("/library/continue", noStore(), continueWatchingHandler(deps.Playback))
	protected.GET("/library/movies/:id/subtitles/:subtitleID", noStore(), subtitleTrackHandler(deps.Subtitles))
	protected.GET("/library/movies/:id/subtitle-search", noStore(), subtitleSearchHandler(deps.Subtitles))
	protected.GET("/library/movies/:id/subtitle-search/:index", noStore(), subtitleFetchHandler(deps.Subtitles))

	protected.GET("/library/facets", noStore(), libraryFacetsHandler(deps.Collections))
	protected.GET("/actors/avatar", actorAvatarHandler(deps.Avatars))
	protected.GET("/library/movies/:id/collections", noStore(), movieCollectionsHandler(deps.Collections))
	collectionsAPI := protected.Group("/collections", noStore())
	collectionsAPI.GET("", collectionListHandler(deps.Collections))
	collectionsAPI.POST("", collectionCreateHandler(deps.Collections))
	collectionsAPI.PATCH("/:id", collectionRenameHandler(deps.Collections))
	collectionsAPI.DELETE("/:id", collectionDeleteHandler(deps.Collections))
	collectionsAPI.PUT("/:id/movies/:movieID", collectionAddHandler(deps.Collections))
	collectionsAPI.DELETE("/:id/movies/:movieID", collectionRemoveHandler(deps.Collections))

	hls := newHLSSigner()
	protected.GET("/play/file/:fileID", noStore(), playStreamHandler(deps.STRM))
	protected.GET("/play/file/:fileID/transcodes", noStore(), transcodesHandler(deps.Transcoder, hls))
	protected.GET("/play/hls", hlsProxyHandler(deps.Transcoder, hls))

	protected.GET("/organize/log", noStore(), organizeLogHandler(deps.Organize))
	protected.POST("/organize/run", organizeRunHandler(deps.Organize))
	protected.GET("/organize/actors", noStore(), organizeActorsHandler(deps.Organize))
	protected.POST("/organize/actors/merge", organizeMergeActorsHandler(deps.Organize))
	if deps.ActorLinks != nil {
		protected.GET("/organize/actors/link", noStore(), actorLinkStatusHandler(deps.ActorLinks))
		protected.POST("/organize/actors/link", actorLinkStartHandler(deps.ActorLinks))
	}
	protected.GET("/organize/failed", noStore(), organizeFailedHandler(deps.Organize))
	protected.POST("/organize/retry", organizeRetryHandler(deps.Organize))

	protected.GET("/tasks", noStore(), tasksHandler(deps.Tasks))
	protected.POST("/tasks/:id/retry", taskRetryHandler(deps.Tasks))
	protected.PUT("/tasks/library-control", taskLibraryControlHandler(deps.Tasks))
	protected.GET("/tasks/events", taskEventsHandler(deps.Tasks))
	protected.GET("/offline/tasks", noStore(), offlineActivityHandler(deps.Offline))
	protected.POST("/offline/tasks/:id/cancel", offlineControlHandler(deps.Offline, false))
	protected.POST("/offline/tasks/:id/next", offlineControlHandler(deps.Offline, true))

	subscriptionsAPI := protected.Group("/subscriptions", noStore())
	subscriptionsAPI.GET("", subscriptionListHandler(deps.Monitor))
	subscriptionsAPI.GET("/targets", subscriptionTargetsHandler(deps.Monitor))
	subscriptionsAPI.POST("", subscriptionCreateHandler(deps.Monitor))
	subscriptionsAPI.PATCH("/:id", subscriptionUpdateHandler(deps.Monitor))
	subscriptionsAPI.DELETE("/:id", subscriptionRemoveHandler(deps.Monitor))
	subscriptionsAPI.POST("/:id/enqueue", subscriptionEnqueueSingleHandler(deps.Monitor))
	subscriptionsAPI.POST("/enqueue", subscriptionEnqueueBatchHandler(deps.Monitor))
	subscriptionsAPI.GET("/actors/feed", subscriptionActorFeedHandler(deps.Monitor))
	subscriptionsAPI.GET("/actors/:id/feed", subscriptionActorFeedHandler(deps.Monitor))

	protected.GET("/discover/movies", discoverBrowseHandler(deps.Catalogue))
	protected.POST("/discover/movie-states", noStore(), discoverMovieStatesHandler(deps.Catalogue))
	protected.GET("/discover/viewed", noStore(), discoverViewedHandler(deps.Library))
	protected.POST("/discover/viewed", discoverAddViewedHandler(deps.Library))
	protected.GET("/discover/search", discoverSearchHandler(deps.Catalogue))
	protected.GET("/discover/tags", discoverTagsHandler(deps.Catalogue))
	protected.GET("/discover/movies/:id", discoverMovieHandler(deps.Catalogue))
	protected.GET("/discover/movies/resolve", discoverResolveMovieHandler(deps.Catalogue))
	protected.GET("/discover/movies/:id/magnets", discoverMagnetsHandler(deps.Catalogue))
	protected.POST("/discover/movies/:id/offline", offlineAddHandler(deps.Offline))
	protected.GET("/image", imageHandler(deps.Catalogue))

	panAPI := protected.Group("/pan", noStore())
	panAPI.GET("/account", panAccountHandler(deps.Drive))
	panAPI.DELETE("/account", panDisconnectHandler(deps.Drive))
	panAPI.POST("/login", panBeginLoginHandler(deps.Drive))
	panAPI.GET("/login/:id", panLoginStatusHandler(deps.Drive))
	panAPI.GET("/files", panFilesHandler(deps.Drive))
	panAPI.PUT("/directory", panSelectDirectoryHandler(deps.Drive))
	panAPI.DELETE("/directory", panClearDirectoryHandler(deps.Drive))

	if deps.Frontend != nil {
		installFrontend(router, deps.Frontend)
	}
	return router
}

// Vite's default output names contain an eight-character content hash.
var hashedFrontendAsset = regexp.MustCompile(`^assets/.+-[A-Za-z0-9_-]{8}\.[^/]+$`)

func installFrontend(router *gin.Engine, frontend fs.FS) {
	// The home-screen app manifest; Go has no type for it built in.
	_ = mime.AddExtensionType(".webmanifest", "application/manifest+json")
	fileServer := http.FileServer(http.FS(frontend))
	compressed := &sync.Map{}
	indexHTML, indexErr := fs.ReadFile(frontend, "index.html")
	serveIndex := func(c *gin.Context) {
		if indexErr != nil {
			c.AbortWithStatus(http.StatusNotFound)
			return
		}
		http.ServeContent(c.Writer, c.Request, "index.html", time.Time{}, bytes.NewReader(indexHTML))
	}
	router.NoRoute(func(c *gin.Context) {
		if c.Request.URL.Path == "/api" || strings.HasPrefix(c.Request.URL.Path, "/api/") {
			c.Error(domain.E(domain.KindNotFound, "not found", nil))
			return
		}
		c.Header("Cache-Control", "no-cache")
		if c.Request.Method != http.MethodGet && c.Request.Method != http.MethodHead {
			c.Header("Allow", "GET, HEAD")
			c.AbortWithStatus(http.StatusMethodNotAllowed)
			return
		}

		requestedPath := strings.TrimSuffix(strings.TrimPrefix(c.Request.URL.Path, "/"), "/")
		if requestedPath == "" || requestedPath == "index.html" {
			serveIndex(c)
			return
		}
		if !fs.ValidPath(requestedPath) {
			c.AbortWithStatus(http.StatusNotFound)
			return
		}
		if info, err := fs.Stat(frontend, requestedPath); err == nil {
			if info.IsDir() {
				c.AbortWithStatus(http.StatusNotFound)
				return
			}
			if hashedFrontendAsset.MatchString(requestedPath) {
				c.Header("Cache-Control", "public, max-age=31536000, immutable")
				if serveCompressed(c, frontend, requestedPath, compressed) {
					return
				}
			}
			fileServer.ServeHTTP(c.Writer, c.Request)
			return
		}
		// Missing assets must not receive an HTML response or immutable caching.
		if requestedPath == "assets" || strings.HasPrefix(requestedPath, "assets/") || path.Ext(requestedPath) != "" {
			c.AbortWithStatus(http.StatusNotFound)
			return
		}

		serveIndex(c)
	})
}

// compressible are the built asset types worth sending gzipped; fonts and
// images are compressed already.
var compressible = map[string]bool{".js": true, ".css": true, ".svg": true, ".json": true}

// serveCompressed sends a gzipped copy of a built script or stylesheet,
// compressed once on first request, to clients that accept it.
func serveCompressed(c *gin.Context, frontend fs.FS, name string, cache *sync.Map) bool {
	if !compressible[path.Ext(name)] || !strings.Contains(c.GetHeader("Accept-Encoding"), "gzip") {
		return false
	}
	body, ok := cache.Load(name)
	if !ok {
		raw, err := fs.ReadFile(frontend, name)
		if err != nil {
			return false
		}
		var buffer bytes.Buffer
		writer, _ := gzip.NewWriterLevel(&buffer, gzip.BestCompression)
		_, _ = writer.Write(raw)
		_ = writer.Close()
		body, _ = cache.LoadOrStore(name, buffer.Bytes())
	}
	c.Header("Content-Encoding", "gzip")
	c.Header("Vary", "Accept-Encoding")
	c.Data(http.StatusOK, mime.TypeByExtension(path.Ext(name)), body.([]byte))
	return true
}

func securityHeadersMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("X-Frame-Options", "DENY")
		c.Header("Referrer-Policy", "strict-origin-when-cross-origin")
		c.Next()
	}
}
