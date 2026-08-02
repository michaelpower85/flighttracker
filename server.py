import http.server
import socketserver

PORT = 8080

class NoCacheHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Prevent caching of static assets
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

# Set up the server
handler = NoCacheHTTPRequestHandler

# Prevent "Address already in use" errors on restart
socketserver.TCPServer.allow_reuse_address = True

print(f"Starting server on port {PORT} with caching disabled...")
with socketserver.TCPServer(("", PORT), handler) as httpd:
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...")
        httpd.server_close()
