import http.server
import socketserver

PORT = 8000

class Proxy(http.server.SimpleHTTPRequestHandler):
  extra_headers = {
      'cache-control': 'max-age=0, no-cache',
      'cross-origin-embedder-policy': 'require-corp',
      'cross-origin-opener-policy': 'same-origin'
  }

  def end_headers(self):
    for k, v in self.extra_headers.items():
      self.send_header(k, v)
    http.server.SimpleHTTPRequestHandler.end_headers(self)


with socketserver.TCPServer(("", PORT), Proxy) as httpd:
    print("serving at port", PORT)
    httpd.serve_forever()
