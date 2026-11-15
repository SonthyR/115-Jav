package catalogue

import (
	"context"
	"errors"
	"testing"

	"github.com/ppxb/miyabi/internal/database"
	"github.com/ppxb/miyabi/internal/domain"
	"github.com/ppxb/miyabi/internal/javdb"
)

type accountProvider struct {
	stubProviderWithMagnets
	username string
	password string
	loggedIn bool
	loginErr error
}

func (provider *accountProvider) Login(_ context.Context, username, password string) error {
	if provider.loginErr != nil {
		return provider.loginErr
	}
	provider.username, provider.password, provider.loggedIn = username, password, true
	return nil
}

func (provider *accountProvider) LoggedIn() bool   { return provider.loggedIn }
func (provider *accountProvider) Username() string { return provider.username }

func TestUpdateJavDBAccountPersistsCredentials(t *testing.T) {
	store, err := database.Open(t.Context(), t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	provider := &accountProvider{}
	service, err := NewWithClients(t.Context(), store.Client, provider, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer service.Close()

	if err := service.UpdateJavDBAccount(t.Context(), " alice ", "secret"); err != nil {
		t.Fatal(err)
	}
	account, err := service.JavDBAccount(t.Context())
	if err != nil || !account.Configured || !account.LoggedIn || account.Username != "alice" {
		t.Fatalf("account = %+v, error = %v", account, err)
	}
	if provider.username != "alice" || provider.password != "secret" {
		t.Fatalf("login credentials = %q / %q", provider.username, provider.password)
	}
	stored, found, err := database.LoadSetting[javdb.Credentials](t.Context(), store.Client, javdbAccountSetting)
	if err != nil || !found || stored.Username != "alice" || stored.Password != "secret" {
		t.Fatalf("stored account = %+v, found = %t, error = %v", stored, found, err)
	}
}

func TestUpdateJavDBAccountRejectsInvalidCredentials(t *testing.T) {
	tests := []struct {
		name string
		err  error
	}{
		{"auth action", &javdb.APIError{Action: "Unauthorized", Message: "bad password"}},
		{"HTTP 401", &javdb.HTTPError{StatusCode: 401}},
		{"HTTP 403", &javdb.HTTPError{StatusCode: 403}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			store, err := database.Open(t.Context(), t.TempDir())
			if err != nil {
				t.Fatal(err)
			}
			defer store.Close()

			provider := &accountProvider{loginErr: test.err}
			service, err := NewWithClients(t.Context(), store.Client, provider, nil, nil)
			if err != nil {
				t.Fatal(err)
			}
			defer service.Close()

			err = service.UpdateJavDBAccount(t.Context(), "alice", "wrong")
			if err == nil || !domain.IsKind(err, domain.KindInvalid) {
				t.Fatalf("error = %v, want an invalid credentials error", err)
			}
			if got := domain.PublicMessage(err); got != "JavDB 用户名或密码错误，请检查后重试" {
				t.Fatalf("public message = %q", got)
			}
			if !errors.Is(err, test.err) {
				t.Fatalf("error = %v, want preserved cause %v", err, test.err)
			}
			if _, found, err := database.LoadSetting[javdb.Credentials](t.Context(), store.Client, javdbAccountSetting); err != nil || found {
				t.Fatalf("rejected credentials were stored: found = %t, error = %v", found, err)
			}
		})
	}
}

func TestUpdateJavDBAccountReportsLoginOutage(t *testing.T) {
	store, err := database.Open(t.Context(), t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	loginErr := &javdb.HTTPError{StatusCode: 502}
	provider := &accountProvider{loginErr: loginErr}
	service, err := NewWithClients(t.Context(), store.Client, provider, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer service.Close()

	err = service.UpdateJavDBAccount(t.Context(), "alice", "secret")
	if err == nil || !domain.IsKind(err, domain.KindUpstream) {
		t.Fatalf("error = %v, want an upstream error", err)
	}
	if got := domain.PublicMessage(err); got != "连不上 JavDB，请检查网络或代理后重试" {
		t.Fatalf("public message = %q", got)
	}
	if !errors.Is(err, loginErr) {
		t.Fatalf("error = %v, want preserved cause %v", err, loginErr)
	}
}

func TestNewRestoresJavDBAccountOverEnvironmentDefaults(t *testing.T) {
	store, err := database.Open(t.Context(), t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	stored := javdb.Credentials{Username: "stored", Password: "stored-secret"}
	if err := database.SaveSetting(t.Context(), store.Client, javdbAccountSetting, stored); err != nil {
		t.Fatal(err)
	}
	service, err := New(t.Context(), store.Client, nil, nil, nil, javdb.Credentials{Username: "env", Password: "env-secret"})
	if err != nil {
		t.Fatal(err)
	}
	defer service.Close()

	account, err := service.JavDBAccount(t.Context())
	if err != nil || !account.Configured || account.LoggedIn || account.Username != "stored" {
		t.Fatalf("account = %+v, error = %v", account, err)
	}
}
