package database

import "testing"

func TestWithoutQueryArgsDropsBoundValues(t *testing.T) {
	line := withoutQueryArgs(`driver.Exec: query=UPDATE settings SET value = ? args=[{"access_token":"secret"}]`)
	if line != "driver.Exec: query=UPDATE settings SET value = ?" {
		t.Fatalf("got %q", line)
	}
}
