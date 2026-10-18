package ftcsim;

import org.firstinspires.ftc.robotcore.external.Func;
import org.firstinspires.ftc.robotcore.external.Telemetry;

import java.util.ArrayList;
import java.util.List;

/** Driver Station telemetry: update() publishes the composed lines to the browser. */
public class SimTelemetry implements Telemetry {
    private final List<Object> entries = new ArrayList<Object>(); // ItemImpl or LineImpl
    private final List<Runnable> actions = new ArrayList<Runnable>();
    private boolean autoClear = true;
    private int msTransmissionInterval = 250;
    private String itemSeparator = " | ", captionValueSeparator = " : ";
    private final LogImpl log = new LogImpl();

    class ItemImpl implements Item {
        String caption; Object value; String format; Object[] args; Func<?> func; Boolean retained;
        final List<ItemImpl> children = new ArrayList<ItemImpl>();
        String render() {
            String v;
            try {
                if (func != null) v = format != null ? String.format(format, func.value()) : String.valueOf(func.value());
                else if (format != null) v = String.format(format, args);
                else v = String.valueOf(value);
            } catch (Exception e) { v = "<" + e + ">"; }
            StringBuilder b = new StringBuilder(caption == null ? "" : caption);
            if (caption != null && !caption.isEmpty()) b.append(captionValueSeparator);
            b.append(v);
            for (ItemImpl c : children) b.append(itemSeparator).append(c.render());
            return b.toString();
        }
        public String getCaption() { return caption; }
        public Item setCaption(String c) { caption = c; return this; }
        public Item setValue(String f, Object... a) { format = f; args = a; func = null; return this; }
        public Item setValue(Object v) { value = v; format = null; func = null; return this; }
        public <T> Item setValue(Func<T> p) { func = p; format = null; return this; }
        public <T> Item setValue(String f, Func<T> p) { func = p; format = f; return this; }
        public Item setRetained(Boolean r) { retained = r; return this; }
        public boolean isRetained() { return retained != null ? retained : func != null; }
        public Item addData(String c, String f, Object... a) { ItemImpl i = new ItemImpl(); i.caption = c; i.setValue(f, a); children.add(i); return i; }
        public Item addData(String c, Object v) { ItemImpl i = new ItemImpl(); i.caption = c; i.setValue(v); children.add(i); return i; }
        public <T> Item addData(String c, Func<T> p) { ItemImpl i = new ItemImpl(); i.caption = c; i.setValue(p); children.add(i); return i; }
        public <T> Item addData(String c, String f, Func<T> p) { ItemImpl i = new ItemImpl(); i.caption = c; i.setValue(f, p); children.add(i); return i; }
    }
    class LineImpl implements Line {
        String caption; final List<ItemImpl> items = new ArrayList<ItemImpl>();
        String render() {
            StringBuilder b = new StringBuilder(caption == null ? "" : caption);
            for (ItemImpl i : items) { if (b.length() > 0) b.append(itemSeparator); b.append(i.render()); }
            return b.toString();
        }
        public Item addData(String c, String f, Object... a) { ItemImpl i = new ItemImpl(); i.caption = c; i.setValue(f, a); items.add(i); return i; }
        public Item addData(String c, Object v) { ItemImpl i = new ItemImpl(); i.caption = c; i.setValue(v); items.add(i); return i; }
        public <T> Item addData(String c, Func<T> p) { ItemImpl i = new ItemImpl(); i.caption = c; i.setValue(p); items.add(i); return i; }
        public <T> Item addData(String c, String f, Func<T> p) { ItemImpl i = new ItemImpl(); i.caption = c; i.setValue(f, p); items.add(i); return i; }
    }
    class LogImpl implements Log {
        int capacity = 9; DisplayOrder order = DisplayOrder.OLDEST_FIRST; final List<String> lines = new ArrayList<String>();
        public int getCapacity() { return capacity; }
        public void setCapacity(int c) { capacity = c; }
        public DisplayOrder getDisplayOrder() { return order; }
        public void setDisplayOrder(DisplayOrder o) { order = o; }
        public synchronized void add(String entry) { lines.add(entry); while (lines.size() > capacity) lines.remove(0); publish(); }
        public void add(String f, Object... a) { add(String.format(f, a)); }
        public synchronized void clear() { lines.clear(); }
    }

    private synchronized ItemImpl newItem(String c) { ItemImpl i = new ItemImpl(); i.caption = c; entries.add(i); return i; }
    public Item addData(String c, String f, Object... a) { return newItem(c).setValue(f, a); }
    public Item addData(String c, Object v) { return newItem(c).setValue(v); }
    public <T> Item addData(String c, Func<T> p) { return newItem(c).setValue(p); }
    public <T> Item addData(String c, String f, Func<T> p) { return newItem(c).setValue(f, p); }
    public synchronized boolean removeItem(Item item) { return entries.remove(item); }
    public synchronized void clear() {
        List<Object> keep = new ArrayList<Object>();
        for (Object o : entries) if (o instanceof ItemImpl && ((ItemImpl) o).isRetained()) keep.add(o);
        entries.clear(); entries.addAll(keep);
    }
    public synchronized void clearAll() { entries.clear(); log.clear(); }
    public synchronized Object addAction(Runnable a) { actions.add(a); return a; }
    public synchronized boolean removeAction(Object t) { return actions.remove(t); }
    public void speak(String text) { Sim.addLog("speak: " + text); }
    public void speak(String text, String languageCode, String countryCode) { speak(text); }
    public boolean update() {
        synchronized (this) { for (Runnable r : actions) r.run(); }
        publish();
        if (autoClear) clear();
        return true;
    }
    private synchronized void publish() {
        List<String> out = new ArrayList<String>();
        for (Object o : entries) out.add(o instanceof ItemImpl ? ((ItemImpl) o).render() : ((LineImpl) o).render());
        List<String> lg = new ArrayList<String>(log.lines);
        if (log.order == Log.DisplayOrder.NEWEST_FIRST) java.util.Collections.reverse(lg);
        out.addAll(lg);
        Sim.telemetry = out;
    }
    public synchronized Line addLine() { LineImpl l = new LineImpl(); entries.add(l); return l; }
    public synchronized Line addLine(String c) { LineImpl l = new LineImpl(); l.caption = c; entries.add(l); return l; }
    public synchronized boolean removeLine(Line line) { return entries.remove(line); }
    public boolean isAutoClear() { return autoClear; }
    public void setAutoClear(boolean a) { autoClear = a; }
    public int getMsTransmissionInterval() { return msTransmissionInterval; }
    public void setMsTransmissionInterval(int ms) { msTransmissionInterval = ms; }
    public String getItemSeparator() { return itemSeparator; }
    public void setItemSeparator(String s) { itemSeparator = s; }
    public String getCaptionValueSeparator() { return captionValueSeparator; }
    public void setCaptionValueSeparator(String s) { captionValueSeparator = s; }
    public void setDisplayFormat(DisplayFormat f) {}
    public Log log() { return log; }
}
