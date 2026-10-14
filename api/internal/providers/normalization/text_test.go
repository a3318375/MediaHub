package normalization

import "testing"

func TestPlainText(t *testing.T) {
	for _, tt := range []struct{ input, want string }{
		{"one<br><br/>two", "one\ntwo"},
		{"<p> A <b>bold</b> &amp; &#39;quoted&#39;&nbsp; </p><p>B</p>", "A bold & 'quoted'\nB"},
		{"plain   text", "plain text"},
	} {
		if got := PlainText(tt.input); got != tt.want {
			t.Errorf("%q: got %q, want %q", tt.input, got, tt.want)
		}
	}
}
