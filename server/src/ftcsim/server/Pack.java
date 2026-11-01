package ftcsim.server;

import java.io.*;
import java.nio.file.*;
import java.util.*;
import java.util.zip.*;

/** Builds web/java/ftcsim.jar for the in-browser runtime (a plain JRE has no jar tool):
 *  java -cp build/server ftcsim.server.Pack out.jar dir [prefix/=dir ...] */
public final class Pack {
    public static void main(String[] a) throws IOException {
        Path out = Paths.get(a[0]);
        Files.createDirectories(out.toAbsolutePath().getParent());
        try (ZipOutputStream z = new ZipOutputStream(new FileOutputStream(out.toFile()))) {
            for (int i = 1; i < a.length; i++) {
                int eq = a[i].indexOf('=');
                String prefix = eq < 0 ? "" : a[i].substring(0, eq);
                final Path dir = Paths.get(eq < 0 ? a[i] : a[i].substring(eq + 1));
                List<Path> files = new ArrayList<Path>();
                try (java.util.stream.Stream<Path> w = Files.walk(dir)) { for (Iterator<Path> it = w.iterator(); it.hasNext(); ) { Path p = it.next(); if (Files.isRegularFile(p)) files.add(p); } }
                Collections.sort(files);
                for (Path p : files) {
                    z.putNextEntry(new ZipEntry(prefix + dir.relativize(p).toString().replace(File.separatorChar, '/')));
                    z.write(Files.readAllBytes(p));
                    z.closeEntry();
                }
            }
        }
    }
}
