package ftcsim.server;

import java.io.*;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;

/**
 * Minimal WebSocket endpoint (RFC 6455, text frames only) for the per-tick /api/sync call.
 * A browser fetch costs 1-6 ms per request, a WebSocket message ~0.1 ms, and lockstep needs one exchange every 10 ms of sim time.
 * Message: "id\npath\njsonBody" -> reply "id\njsonResult". Only pages served by this simulator may connect.
 */
final class WsChannel {
    private WsChannel() {}

    /** listens on 127.0.0.1:port in the background; returns the port, or -1 if it is taken (the page then stays on HTTP) */
    static int start(int port) {
        final ServerSocket ss;
        try { ss = new ServerSocket(port, 4, InetAddress.getByName("127.0.0.1")); } catch (IOException e) { return -1; }
        Thread t = new Thread(() -> {
            for (;;) {
                try { Socket s = ss.accept(); Thread c = new Thread(() -> serve(s), "ws-client"); c.setDaemon(true); c.start(); }
                catch (IOException e) { return; }
            }
        }, "ws-accept");
        t.setDaemon(true); t.start();
        return port;
    }

    private static void serve(Socket s) {
        try (Socket sock = s) {
            sock.setTcpNoDelay(true);
            InputStream in = new BufferedInputStream(sock.getInputStream());
            OutputStream out = new BufferedOutputStream(sock.getOutputStream());
            String key = null, origin = null, line;
            while (!(line = readLine(in)).isEmpty()) {
                int c = line.indexOf(':'); if (c < 0) continue;
                String h = line.substring(0, c).trim().toLowerCase(), v = line.substring(c + 1).trim();
                if (h.equals("sec-websocket-key")) key = v;
                if (h.equals("origin")) origin = v;
            }
            if (key == null || !SimServer.trustedOrigin(origin)) {
                out.write("HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n".getBytes(StandardCharsets.US_ASCII)); out.flush(); return;
            }
            // SHA-1 is fixed by RFC 6455 for this handshake value (browsers check it); it is not used for any security purpose here
            String accept = Base64.getEncoder().encodeToString(MessageDigest.getInstance("SHA-1")
                .digest((key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").getBytes(StandardCharsets.US_ASCII)));
            out.write(("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " + accept + "\r\n\r\n")
                .getBytes(StandardCharsets.US_ASCII));
            out.flush();
            ByteArrayOutputStream msg = new ByteArrayOutputStream();
            for (;;) {
                int b0 = in.read(), b1 = in.read(); if (b0 < 0 || b1 < 0) return;
                int op = b0 & 0x0f; boolean fin = (b0 & 0x80) != 0;
                long len = b1 & 0x7f;
                if (len == 126) len = (in.read() << 8) | in.read();
                else if (len == 127) { len = 0; for (int i = 0; i < 8; i++) len = (len << 8) | in.read(); }
                if (len > (64 << 20)) return;                        // 64 MB is far beyond any real message
                byte[] mask = new byte[4]; if ((b1 & 0x80) != 0) readFully(in, mask);
                byte[] p = new byte[(int) len]; readFully(in, p);
                for (int i = 0; i < p.length; i++) p[i] ^= mask[i & 3];
                if (op == 8) { frame(out, 8, new byte[0]); return; }     // close
                if (op == 9) { frame(out, 10, p); continue; }            // ping -> pong
                if (op == 10) continue;
                msg.write(p);
                if (!fin) continue;
                String m = msg.toString("UTF-8"); msg.reset();
                int a = m.indexOf('\n'), b = m.indexOf('\n', a + 1);
                if (a < 0 || b < 0) continue;
                Object r = SimServer.dispatch(m.substring(a + 1, b), m.substring(b + 1));
                frame(out, 1, (m.substring(0, a) + "\n" + (r == null ? "{\"fatal\":\"unknown api\"}" : ftcsim.Json.write(r))).getBytes(StandardCharsets.UTF_8));
            }
        } catch (Exception e) { /* page closed or reloaded */ }
    }

    private static void frame(OutputStream out, int op, byte[] p) throws IOException {
        out.write(0x80 | op);
        if (p.length < 126) out.write(p.length);
        else if (p.length < 65536) { out.write(126); out.write(p.length >> 8); out.write(p.length & 0xff); }
        else { out.write(127); for (int i = 7; i >= 0; i--) out.write(i >= 4 ? 0 : (p.length >>> (8 * i)) & 0xff); }
        out.write(p); out.flush();
    }
    private static void readFully(InputStream in, byte[] b) throws IOException {
        for (int o = 0; o < b.length; ) { int n = in.read(b, o, b.length - o); if (n < 0) throw new EOFException(); o += n; }
    }
    private static String readLine(InputStream in) throws IOException {
        StringBuilder sb = new StringBuilder(); int c;
        while ((c = in.read()) >= 0 && c != '\n') { if (c != '\r') sb.append((char) c); if (sb.length() > 8192) throw new IOException("header too long"); }
        if (c < 0) throw new EOFException();
        return sb.toString();
    }
}
