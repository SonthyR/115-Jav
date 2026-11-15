package api

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/ppxb/miyabi/internal/catalogue"
	"github.com/ppxb/miyabi/internal/domain"
)

type stubJavDBAccount struct {
	account   catalogue.JavDBAccount
	err       error
	loginUser string
	loginPass string
}

func (stub *stubJavDBAccount) JavDBAccount(context.Context) (catalogue.JavDBAccount, error) {
	return stub.account, stub.err
}

func (stub *stubJavDBAccount) UpdateJavDBAccount(_ context.Context, username, password string) error {
	if stub.err != nil {
		return stub.err
	}
	stub.loginUser, stub.loginPass = username, password
	stub.account = catalogue.JavDBAccount{Configured: true, LoggedIn: true, Username: username}
	return nil
}

func javdbTestRouter(manager JavDBAccountManager) http.Handler {
	return NewRouter(Dependencies{
		Access: NewAccessGateService("", ""),
		JavDB:  manager,
		Logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
	})
}

func TestJavDBAccountEndpoints(t *testing.T) {
	stub := &stubJavDBAccount{account: catalogue.JavDBAccount{Configured: true, Username: "alice"}}
	router := javdbTestRouter(stub)

	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/settings/javdb", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("GET status = %d", rec.Code)
	}
	var account catalogue.JavDBAccount
	if err := json.Unmarshal(rec.Body.Bytes(), &account); err != nil {
		t.Fatal(err)
	}
	if !account.Configured || account.LoggedIn || account.Username != "alice" {
		t.Fatalf("GET account = %+v", account)
	}

	body, _ := json.Marshal(javdbAccountInput{Username: "alice", Password: "secret"})
	rec = httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/settings/javdb", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(rec, request)
	if rec.Code != http.StatusOK {
		t.Fatalf("POST status = %d, body = %s", rec.Code, rec.Body)
	}
	if stub.loginUser != "alice" || stub.loginPass != "secret" {
		t.Fatalf("login = %q / %q", stub.loginUser, stub.loginPass)
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &account); err != nil {
		t.Fatal(err)
	}
	if !account.Configured || !account.LoggedIn {
		t.Fatalf("POST account = %+v", account)
	}
}

func TestJavDBAccountRejectsEmptyCredentials(t *testing.T) {
	router := javdbTestRouter(&stubJavDBAccount{})
	for _, body := range []string{`{}`, `{"username":"alice"}`, `{"password":"secret"}`, `{"username":"","password":"secret"}`} {
		rec := httptest.NewRecorder()
		request := httptest.NewRequest(http.MethodPost, "/api/settings/javdb", bytes.NewReader([]byte(body)))
		request.Header.Set("Content-Type", "application/json")
		router.ServeHTTP(rec, request)
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("body %s: status = %d", body, rec.Code)
		}
	}
}

func TestJavDBAccountReportsLoginFailure(t *testing.T) {
	stub := &stubJavDBAccount{err: domain.E(domain.KindUpstream, "JavDB 登录失败", nil)}
	router := javdbTestRouter(stub)
	body, _ := json.Marshal(javdbAccountInput{Username: "alice", Password: "wrong"})
	rec := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/settings/javdb", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(rec, request)
	if rec.Code != http.StatusBadGateway {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body)
	}
}
