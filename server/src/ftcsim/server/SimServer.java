package ftcsim.server;

import com.qualcomm.robotcore.eventloop.opmode.Autonomous;
import com.qualcomm.robotcore.eventloop.opmode.Disabled;
import com.qualcomm.robotcore.eventloop.opmode.OpMode;
import com.qualcomm.robotcore.eventloop.opmode.TeleOp;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import ftcsim.Json;
import ftcsim.Runner;
import ftcsim.Sim;

import javax.tools.*;
import java.io.*;
import java.lang.reflect.Modifier;
import java.net.InetSocketAddress;
import java.net.URL;
import java.net.URLClassLoader;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.Executors;

/**
 * Local bridge: serves the web app, compiles OpModes with the Eclipse compiler (ECJ, works on a plain JRE 8+)
 * against the simulated FTC SDK, and runs them in this JVM. The browser runs the physics and talks to /api/sync.
 */
public class SimServer {
    static Path home, web, sdkClasses, workDir, libsDir, examplesDir;
    static int wsPort = -1, httpPort;
    static URLClassLoader userLoader;
    static final Map<String, String> opModes = new LinkedHashMap<String, String>(); // display name -> class

    public static void main(String[] args) throws Exception {
        Locale.setDefault(Locale.US);   // the Robot Controller formats numbers with a dot
        home =Paths.get(args.length > 0 ? args[0] : ".").toAbsolutePath().normalize();
        int port = args.length > 1 ? Integer.parseInt(args[1]) : 8740;
        httpPort = port;
        web = home.resolve("web"); sdkClasses = home.resolve("build/sdk"); libsDir = home.resolve("libs");
        examplesDir = home.resolve("examples"); workDir = home.resolve("build/user");
        HttpServer s = HttpServer.create(new InetSocketAddress("127.0.0.1", port), 0);
        s.createContext("/api/", new com.sun.net.httpserver.HttpHandler() { public void handle(HttpExchange x) throws IOException { api(x); } });
        s.createContext("/", new com.sun.net.httpserver.HttpHandler() { public void handle(HttpExchange x) throws IOException { file(x); } });
        s.setExecutor(Executors.newCachedThreadPool());
        s.start();
        wsPort = WsChannel.start(port + 1);
        System.out.println("FTC simulator: open http://localhost:" + port + "/   (Ctrl+C to quit)");
    }

    // ------------------------------------------------------------------ static files
    static void file(HttpExchange x) throws IOException {
        String p = x.getRequestURI().getPath();
        if (p.equals("/")) p = "/index.html";
        Path f = web.resolve(p.substring(1)).normalize();
        if (!f.startsWith(web) || !Files.isRegularFile(f)) { send(x, 404, "text/plain", "not found".getBytes(StandardCharsets.UTF_8)); return; }
        send(x, 200, mime(f.toString()), Files.readAllBytes(f));
    }
    static String mime(String n) {
        n = n.toLowerCase(Locale.ROOT);
        if (n.endsWith(".html")) return "text/html; charset=utf-8";
        if (n.endsWith(".js") || n.endsWith(".mjs")) return "text/javascript; charset=utf-8";
        if (n.endsWith(".css")) return "text/css; charset=utf-8";
        if (n.endsWith(".json")) return "application/json";
        if (n.endsWith(".wasm")) return "application/wasm";
        if (n.endsWith(".png")) return "image/png";
        if (n.endsWith(".svg")) return "image/svg+xml";
        if (n.endsWith(".glb")) return "model/gltf-binary";
        return "application/octet-stream";
    }
    static void send(HttpExchange x, int code, String type, byte[] body) throws IOException {
        x.getResponseHeaders().set("Content-Type", type);
        x.getResponseHeaders().set("Cache-Control", "no-store");
        x.sendResponseHeaders(code, body.length);
        OutputStream o = x.getResponseBody(); o.write(body); o.close();
    }
    static void json(HttpExchange x, Object o) throws IOException { send(x, 200, "application/json", Json.write(o).getBytes(StandardCharsets.UTF_8)); }

    // ------------------------------------------------------------------ API
    /** the API compiles and runs Java, so only this simulator's own pages may call it: other sites open in the browser
     *  could otherwise POST here (a text/plain POST needs no CORS preflight), and DNS rebinding is stopped by the Host check */
    static boolean trustedOrigin(String origin) {
        return origin != null && (origin.equals("http://localhost:" + httpPort) || origin.equals("http://127.0.0.1:" + httpPort));
    }
    static void api(HttpExchange x) throws IOException {
        String origin = x.getRequestHeaders().getFirst("Origin"), host = x.getRequestHeaders().getFirst("Host");
        boolean hostOk = host != null && (host.equals("localhost:" + httpPort) || host.equals("127.0.0.1:" + httpPort));
        // fail closed: the page always POSTs with an Origin; a GET (img tag) or a request without Origin is not from it
        if (!hostOk || !"POST".equals(x.getRequestMethod()) || !trustedOrigin(origin)) { send(x, 403, "text/plain", "forbidden".getBytes(StandardCharsets.UTF_8)); return; }
        Object r = dispatch(x.getRequestURI().getPath(), readBody(x));
        if (r == null) send(x, 404, "text/plain", "unknown api".getBytes(StandardCharsets.UTF_8));
        else json(x, r);
    }
    /** one API call, shared by HTTP and the WebSocket channel; null = unknown path */
    static Object dispatch(String p, String bodyText) {
        try {
            Map<String, Object> body = Json.obj(Json.parse(bodyText));
            if (p.equals("/api/sync")) return sync(body);
            if (p.equals("/api/compile")) return compile(Json.arr(body.get("files")));
            if (p.equals("/api/init")) {
                String cls = Json.str(body.get("cls"), "");
                if (userLoader == null) throw new IllegalStateException("Build the code first");
                // the hardware is created with the current sensor state (encoder offsets, IMU zero), like on power-up
                Sim.time = Json.num(body.get("t"), Sim.time);
                Sim.sensors = Json.obj(body.get("sensors"));
                Runner.init(userLoader.loadClass(cls), Json.arr(body.get("devices")), Json.str(body.get("name"), cls));
                return status();
            }
            if (p.equals("/api/start")) { Runner.start(); return status(); }
            if (p.equals("/api/stop")) { Runner.stop(); return status(); }
            if (p.equals("/api/examples")) return examples();
            if (p.equals("/api/status")) { Map<String, Object> m = status(); m.put("wsPort", wsPort); return m; }
            return null;
        } catch (Throwable e) {
            Map<String, Object> m = new LinkedHashMap<String, Object>();
            m.put("fatal", e.toString());
            Throwable c = e; while (c.getCause() != null && c.getCause() != c) c = c.getCause();
            if (c != e) m.put("cause", c.toString());
            return m;
        }
    }
    static String readBody(HttpExchange x) throws IOException {
        InputStream in = x.getRequestBody(); ByteArrayOutputStream b = new ByteArrayOutputStream();
        byte[] buf = new byte[65536]; int n; while ((n = in.read(buf)) > 0) b.write(buf, 0, n);
        String s = b.toString("UTF-8"); return s.isEmpty() ? "{}" : s;
    }

    static Map<String, Object> status() {
        Map<String, Object> m = new LinkedHashMap<String, Object>();
        m.put("state", Runner.state);
        m.put("opmode", Runner.opModeName);
        m.put("error", Runner.error);
        return m;
    }

    static Map<String, Object> sync(Map<String, Object> b) {
        List<Object> gp = Json.arr(b.get("gp"));
        Sim.sync(Json.num(b.get("t"), 0), Json.obj(b.get("sensors")),
                gp.size() > 0 ? Json.obj(gp.get(0)) : null, gp.size() > 1 ? Json.obj(gp.get(1)) : null,
                (long) Json.num(b.get("timeout"), 25));
        Map<String, Object> m = status();
        m.put("out", Runner.outputs());
        m.put("tele", Sim.telemetry);
        List<String> lg;
        synchronized (Sim.log) { lg = new ArrayList<String>(Sim.log); Sim.log.clear(); }
        m.put("log", lg);
        String f1 = Sim.gamepads[0].simFeedback, f2 = Sim.gamepads[1].simFeedback;
        if (f1 != null || f2 != null) { m.put("fb", Arrays.asList(f1, f2)); Sim.gamepads[0].simFeedback = null; Sim.gamepads[1].simFeedback = null; }
        return m;
    }

    static List<Object> examples() throws IOException {
        List<Object> r = new ArrayList<Object>();
        if (!Files.isDirectory(examplesDir)) return r;
        try (DirectoryStream<Path> ds = Files.newDirectoryStream(examplesDir, "*.java")) {
            List<Path> ps = new ArrayList<Path>(); for (Path p : ds) ps.add(p); Collections.sort(ps);
            for (Path p : ps) {
                Map<String, Object> m = new LinkedHashMap<String, Object>();
                m.put("name", p.getFileName().toString());
                m.put("code", new String(Files.readAllBytes(p), StandardCharsets.UTF_8));
                r.add(m);
            }
        }
        return r;
    }

    // ------------------------------------------------------------------ compile
    static synchronized Map<String, Object> compile(List<Object> files) throws Exception {
        Runner.stop();
        Path src = workDir.resolve("src"), out = workDir.resolve("classes");
        deleteTree(workDir); Files.createDirectories(src); Files.createDirectories(out);
        List<File> sources = new ArrayList<File>();
        Set<String> names = new HashSet<String>();
        for (Object o : files) {
            Map<String, Object> f = Json.obj(o);
            String name = Paths.get(Json.str(f.get("name"), "OpMode.java")).getFileName().toString();
            if (!name.endsWith(".java")) continue;
            Path dst = src.resolve(name);
            Files.write(dst, Json.str(f.get("code"), "").getBytes(StandardCharsets.UTF_8));
            sources.add(dst.toFile()); names.add(name);
        }
        // team libraries: any .java under libs/ is compiled with the user code, any .jar is put on the classpath
        List<URL> extra = new ArrayList<URL>();
        StringBuilder cp = new StringBuilder(sdkClasses.toString());
        if (Files.isDirectory(libsDir)) {
            try (java.util.stream.Stream<Path> w = Files.walk(libsDir)) {
                for (Iterator<Path> it = w.iterator(); it.hasNext(); ) {
                    Path p = it.next();
                    if (p.toString().endsWith(".java")) sources.add(p.toFile());
                    if (p.toString().endsWith(".jar")) { cp.append(File.pathSeparator).append(p); extra.add(p.toUri().toURL()); }
                }
            }
        }
        Runner.userFiles = names;

        JavaCompiler jc = new org.eclipse.jdt.internal.compiler.tool.EclipseCompiler();
        DiagnosticCollector<JavaFileObject> dc = new DiagnosticCollector<JavaFileObject>();
        StandardJavaFileManager fm = jc.getStandardFileManager(dc, Locale.ENGLISH, StandardCharsets.UTF_8);
        List<String> opts = Arrays.asList("-d", out.toString(), "-cp", cp.toString(), "-1.8", "-g", "-encoding", "UTF-8", "-nowarn", "-proc:none");
        boolean ok = sources.isEmpty() || jc.getTask(null, fm, dc, opts, null, fm.getJavaFileObjectsFromFiles(sources)).call();
        fm.close();

        List<Object> diags = new ArrayList<Object>();
        for (Diagnostic<? extends JavaFileObject> d : dc.getDiagnostics()) {
            if (d.getKind() == Diagnostic.Kind.NOTE) continue;
            Map<String, Object> m = new LinkedHashMap<String, Object>();
            m.put("kind", d.getKind().toString());
            m.put("file", d.getSource() == null ? "" : Paths.get(d.getSource().getName()).getFileName().toString());
            m.put("line", d.getLineNumber());
            m.put("col", d.getColumnNumber());
            m.put("msg", d.getMessage(Locale.ENGLISH));
            diags.add(m);
        }
        if (dc.getDiagnostics().isEmpty() && !ok) diags.add(Collections.singletonMap("msg", "Compilation failed"));

        List<Object> found = new ArrayList<Object>();
        opModes.clear();
        boolean hasErrors = false;
        for (Object d : diags) if ("ERROR".equals(Json.obj(d).get("kind"))) hasErrors = true;
        if (!hasErrors) {
            extra.add(0, out.toUri().toURL());
            if (userLoader != null) try { userLoader.close(); } catch (IOException ignored) {}
            userLoader = new URLClassLoader(extra.toArray(new URL[0]), SimServer.class.getClassLoader());
            try (java.util.stream.Stream<Path> w = Files.walk(out)) {
                for (Iterator<Path> it = w.iterator(); it.hasNext(); ) {
                    Path p = it.next();
                    if (!p.toString().endsWith(".class")) continue;
                    String cn = out.relativize(p).toString().replace(File.separatorChar, '.').replaceAll("\\.class$", "");
                    Class<?> c;
                    try { c = Class.forName(cn, false, userLoader); } catch (Throwable e) { continue; }
                    if (!OpMode.class.isAssignableFrom(c) || Modifier.isAbstract(c.getModifiers()) || c.isAnnotationPresent(Disabled.class)) continue;
                    TeleOp t = c.getAnnotation(TeleOp.class); Autonomous a = c.getAnnotation(Autonomous.class);
                    if (t == null && a == null) continue;
                    Map<String, Object> m = new LinkedHashMap<String, Object>();
                    String nm = t != null ? t.name() : a.name();
                    m.put("cls", cn);
                    m.put("name", nm.isEmpty() ? c.getSimpleName() : nm);
                    m.put("group", t != null ? t.group() : a.group());
                    m.put("kind", t != null ? "TeleOp" : "Autonomous");
                    if (a != null) m.put("preselectTeleOp", a.preselectTeleOp());
                    found.add(m);
                }
            }
        }
        Map<String, Object> r = new LinkedHashMap<String, Object>();
        r.put("ok", !hasErrors);
        r.put("diagnostics", diags);
        r.put("opmodes", found);
        return r;
    }

    static void deleteTree(Path p) throws IOException {
        if (!Files.exists(p)) return;
        try (java.util.stream.Stream<Path> w = Files.walk(p)) {
            List<Path> all = new ArrayList<Path>(); for (Iterator<Path> it = w.iterator(); it.hasNext(); ) all.add(it.next());
            Collections.reverse(all);
            for (Path q : all) Files.deleteIfExists(q);
        }
    }
}
