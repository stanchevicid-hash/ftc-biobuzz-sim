package ftcsim;

import java.util.*;

/** Minimal JSON reader/writer (objects -> LinkedHashMap, arrays -> ArrayList, numbers -> Double). */
public final class Json {
    private final String s; private int i;
    private Json(String s) { this.s = s; }

    public static Object parse(String s) { Json j = new Json(s); j.ws(); Object v = j.val(); return v; }

    @SuppressWarnings("unchecked")
    public static Map<String, Object> obj(Object o) { return o instanceof Map ? (Map<String, Object>) o : new LinkedHashMap<String, Object>(); }
    @SuppressWarnings("unchecked")
    public static List<Object> arr(Object o) { return o instanceof List ? (List<Object>) o : new ArrayList<Object>(); }
    public static double num(Object o, double def) { return o instanceof Number ? ((Number) o).doubleValue() : def; }
    public static boolean bool(Object o) { return o instanceof Boolean && (Boolean) o; }
    public static String str(Object o, String def) { return o instanceof String ? (String) o : def; }

    private void ws() { while (i < s.length() && Character.isWhitespace(s.charAt(i))) i++; }
    private Object val() {
        char c = s.charAt(i);
        if (c == '{') { i++; Map<String, Object> m = new LinkedHashMap<String, Object>(); ws();
            if (s.charAt(i) == '}') { i++; return m; }
            while (true) { ws(); String k = (String) val(); ws(); i++; /* : */ ws(); m.put(k, val()); ws();
                if (s.charAt(i++) == '}') return m; } }
        if (c == '[') { i++; List<Object> a = new ArrayList<Object>(); ws();
            if (s.charAt(i) == ']') { i++; return a; }
            while (true) { ws(); a.add(val()); ws(); if (s.charAt(i++) == ']') return a; } }
        if (c == '"') { i++; StringBuilder b = new StringBuilder();
            while (true) { char d = s.charAt(i++);
                if (d == '"') return b.toString();
                if (d == '\\') { char e = s.charAt(i++);
                    switch (e) { case 'n': b.append('\n'); break; case 't': b.append('\t'); break; case 'r': b.append('\r'); break;
                        case 'b': b.append('\b'); break; case 'f': b.append('\f'); break;
                        case 'u': b.append((char) Integer.parseInt(s.substring(i, i + 4), 16)); i += 4; break;
                        default: b.append(e); }
                } else b.append(d); } }
        if (s.startsWith("true", i)) { i += 4; return Boolean.TRUE; }
        if (s.startsWith("false", i)) { i += 5; return Boolean.FALSE; }
        if (s.startsWith("null", i)) { i += 4; return null; }
        int st = i; while (i < s.length() && "+-0123456789.eE".indexOf(s.charAt(i)) >= 0) i++;
        return Double.parseDouble(s.substring(st, i));
    }

    public static String write(Object o) { StringBuilder b = new StringBuilder(); w(b, o); return b.toString(); }
    private static void w(StringBuilder b, Object o) {
        if (o == null) b.append("null");
        else if (o instanceof String) q(b, (String) o);
        else if (o instanceof Double || o instanceof Float) { double d = ((Number) o).doubleValue();
            if (Double.isNaN(d) || Double.isInfinite(d)) b.append("null"); else b.append(d); }
        else if (o instanceof Number || o instanceof Boolean) b.append(o);
        else if (o instanceof Map) { b.append('{'); boolean f = true;
            for (Map.Entry<?, ?> e : ((Map<?, ?>) o).entrySet()) { if (!f) b.append(','); f = false; q(b, String.valueOf(e.getKey())); b.append(':'); w(b, e.getValue()); }
            b.append('}'); }
        else if (o instanceof Collection) { b.append('['); boolean f = true;
            for (Object x : (Collection<?>) o) { if (!f) b.append(','); f = false; w(b, x); } b.append(']'); }
        else q(b, o.toString());
    }
    private static void q(StringBuilder b, String s) {
        b.append('"');
        for (int k = 0; k < s.length(); k++) { char c = s.charAt(k);
            switch (c) { case '"': b.append("\\\""); break; case '\\': b.append("\\\\"); break; case '\n': b.append("\\n"); break;
                case '\r': b.append("\\r"); break; case '\t': b.append("\\t"); break;
                default: if (c < 0x20) b.append(String.format("\\u%04x", (int) c)); else b.append(c); } }
        b.append('"');
    }
}
