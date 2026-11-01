package ftcsim.server;

import ftcsim.Json;

import java.nio.charset.StandardCharsets;
import java.nio.file.Paths;
import java.util.*;
import java.util.jar.JarEntry;
import java.util.jar.JarFile;

/**
 * Entry point for the in-browser JVM (CheerpJ): the same API as SimServer, called from JavaScript instead of HTTP.
 * The SDK, this bridge and the examples come in one jar from the web server (/app/...), compiled code goes to the
 * page memory.
 */
public final class BrowserApi {
    private BrowserApi() {}
    static String jar;

    /** base = the folder of ftcsim.jar and ecj.jar in CheerpJ's file system, e.g. "/app/java/" */
    public static void setup(String base) {
        Locale.setDefault(Locale.US);
        // ECJ parses on a helper thread and polls it with sleep/wait; on CheerpJ's green threads that made a build
        // take 6-100 s and sometimes crashed in the scanner. One thread: 0.4 s, no crashes.
        System.setProperty("jdt.compiler.useSingleThread", "true");
        jar = base + "ftcsim.jar";
        SimServer.home = Paths.get("/files/ftcsim");
        SimServer.sdkClasses = Paths.get(jar);
        SimServer.libsDir = SimServer.home.resolve("libs");
        SimServer.examplesDir = SimServer.home.resolve("examples");
    }

    public static String call(String path, String body) {
        Object r;
        try { r = path.equals("/api/examples") ? examples() : SimServer.dispatch(path, body); }
        catch (Throwable e) { r = Collections.singletonMap("fatal", e.toString()); }
        return Json.write(r == null ? Collections.singletonMap("fatal", "unknown api " + path) : r);
    }

    /** examples/*.java packed into ftcsim.jar (sub-folders such as examples/robots are not OpModes) */
    static List<Object> examples() throws Exception {
        List<Object> r = new ArrayList<Object>();
        try (JarFile jf = new JarFile(jar)) {
            List<JarEntry> es = new ArrayList<JarEntry>();
            for (Enumeration<JarEntry> en = jf.entries(); en.hasMoreElements(); ) {
                JarEntry e = en.nextElement(); String n = e.getName();
                if (n.startsWith("examples/") && n.endsWith(".java") && n.indexOf('/', 9) < 0) es.add(e);
            }
            Collections.sort(es, new Comparator<JarEntry>() { public int compare(JarEntry a, JarEntry b) { return a.getName().compareTo(b.getName()); } });
            for (JarEntry e : es) {
                Map<String, Object> m = new LinkedHashMap<String, Object>();
                m.put("name", e.getName().substring(9));
                java.io.InputStream in = jf.getInputStream(e); java.io.ByteArrayOutputStream b = new java.io.ByteArrayOutputStream();
                byte[] buf = new byte[8192]; int k; while ((k = in.read(buf)) > 0) b.write(buf, 0, k); in.close();
                m.put("code", new String(b.toByteArray(), StandardCharsets.UTF_8));
                r.add(m);
            }
        }
        return r;
    }
}
