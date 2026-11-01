package ftcsim.server;

import java.nio.file.Paths;
import java.util.*;

/**
 * Runnable check of the in-memory OpMode build used by start.bat and by the in-browser runtime:
 *   java -jar server/lib/ecj.jar -1.8 -nowarn -cp "build/sdk;build/server;server/lib/ecj.jar" -d build/tests tests/CompileCheck.java
 *   java -cp "build/sdk;build/server;server/lib/ecj.jar;build/tests" ftcsim.server.CompileCheck
 */
public class CompileCheck {
    static int failed = 0;
    static void check(String name, boolean ok, Object info) { System.out.println((ok ? "OK   " : "FAIL ") + name + "  " + info); if (!ok) failed++; }
    static List<Object> file(String name, String code) {
        Map<String, Object> f = new LinkedHashMap<String, Object>(); f.put("name", name); f.put("code", code);
        return Collections.<Object>singletonList(f);
    }

    public static void main(String[] a) throws Exception {
        SimServer.sdkClasses = Paths.get("build/sdk"); SimServer.libsDir = Paths.get("build/no-libs");
        Map<String, Object> r = SimServer.compile(file("Drive.java",
                "package t;\nimport com.qualcomm.robotcore.eventloop.opmode.*;\n@TeleOp(name = \"Drive\")\npublic class Drive extends LinearOpMode { public void runOpMode() {} }\n"));
        check("good file builds and the OpMode is found", Boolean.TRUE.equals(r.get("ok")) && r.get("opmodes").toString().contains("t.Drive"), r.get("opmodes"));
        r = SimServer.compile(file("Bad.java", "public class Bad {\n  int x = ;\n}\n"));
        Map<?, ?> d = (Map<?, ?>) ((List<?>) r.get("diagnostics")).get(0);
        check("syntax error names file and line", Boolean.FALSE.equals(r.get("ok")) && "Bad.java".equals(d.get("file")) && ((Number) d.get("line")).intValue() == 2, d);
        System.out.println(failed == 0 ? "\nall checks passed" : "\n" + failed + " FAILED");
        System.exit(failed == 0 ? 0 : 1);
    }
}
