import http.server
import socketserver
import urllib.request
import urllib.error

PORT = 8080

class ProxyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Prevent caching of static assets
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def do_GET(self):
        # Route OpenSky API calls through local server proxy to bypass CORS
        if self.path.startswith('/api/opensky'):
            self.handle_proxy()
        else:
            super().do_GET()

    def handle_proxy(self):
        target_url = 'https://opensky-network.org/api/states/all'
        print(f"[PROXY] Intercepting request to: {self.path}")
        print(f"[PROXY] Fetching from origin OpenSky URL: {targetUrl}")

        # Forward the Authorization header if the client browser sent one
        req_headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
        auth_header = self.headers.get('Authorization')
        if auth_header:
            req_headers['Authorization'] = auth_header
            print("[PROXY] Forwarding Authorization header.")

        req = urllib.request.Request(target_url, headers=req_headers)
        
        try:
            with urllib.request.urlopen(req, timeout=30) as response:
                content = response.read()
                print(f"[PROXY] Successfully fetched {len(content)} bytes from OpenSky.")
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(content)
        except urllib.error.HTTPError as e:
            err_body = e.read()
            print(f"[PROXY] HTTP Error {e.code}: {e.reason}")
            print(f"[PROXY] Error Body: {err_body}")
            
            self.send_response(e.code)
            self.send_header('Content-Type', 'text/plain')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(err_body)
        except Exception as e:
            print(f"[PROXY] General Exception: {str(e)}")
            
            self.send_response(500)
            self.send_header('Content-Type', 'text/plain')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(str(e).encode('utf-8'))

# Set up the server
socketserver.TCPServer.allow_reuse_address = True

print(f"Starting server on port {PORT} with caching disabled and local CORS proxy at /api/opensky...")
with socketserver.TCPServer(("", PORT), ProxyHTTPRequestHandler) as httpd:
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...")
        httpd.server_close()
