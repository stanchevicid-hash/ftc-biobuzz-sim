package ftcsim;

import com.qualcomm.robotcore.hardware.Gamepad;

import java.util.*;

/**
 * Shared state between the bridge server and the fake FTC SDK.
 * The browser physics is the master clock: every control tick (10 ms of sim time) it posts sensor data,
 * the OpMode thread runs until its next "barrier" (opModeIsActive(), sleep(), idle(), loop() end...),
 * and the actuator commands are sent back. This lockstep makes runs repeatable and lets the sim run faster
 * than real time.
 */
public final class Sim {
    private Sim() {}

    /** A device that sends commands to the physics (motors, servos...). */
    public interface Output { void write(Map<String, Object> out); }

    public static volatile double time;                 // sim seconds since sim start
    public static long nanoTime() { return Math.round(time * 1e9); }

    public static volatile Map<String, Object> sensors = new HashMap<String, Object>();
    public static final List<Output> outputs = new ArrayList<Output>();
    public static final Gamepad[] gamepads = { new Gamepad(), new Gamepad() };

    public static volatile Thread opThread;
    public static volatile boolean started, stopRequested;

    public static volatile List<String> telemetry = new ArrayList<String>();
    public static final List<String> log = Collections.synchronizedList(new ArrayList<String>());

    private static final Object lock = new Object();
    private static long tick = 0, yielded = -1;

    public static void reset() {
        synchronized (lock) { tick = 0; yielded = -1; }
        outputs.clear(); started = false; stopRequested = false; opThread = null;
        telemetry = new ArrayList<String>(); log.clear();
        gamepads[0] = new Gamepad(); gamepads[1] = new Gamepad();
    }

    /** sensor section helpers: sensors.motors.frontLeft.pos ... */
    public static Map<String, Object> dev(String section, String name) {
        return Json.obj(Json.obj(sensors.get(section)).get(name));
    }
    public static double num(String section, String name, String field, double def) {
        return Json.num(dev(section, name).get(field), def);
    }

    /**
     * Called by the OpMode thread at natural loop points. Blocks until the physics has produced a new tick.
     * Other threads just yield.
     */
    public static void barrier() {
        if (Thread.currentThread() != opThread) { Thread.yield(); return; }
        synchronized (lock) {
            yielded = tick;
            lock.notifyAll();
            while (tick == yielded && !stopRequested) {
                try { lock.wait(50); } catch (InterruptedException e) { Thread.currentThread().interrupt(); return; }
            }
        }
    }

    /** Called by the server for each physics tick. Returns after the OpMode thread yields or timeoutMs passes. */
    public static void sync(double t, Map<String, Object> snap, Map<String, Object> gp1, Map<String, Object> gp2, long timeoutMs) {
        synchronized (lock) {
            time = t;
            sensors = snap;
            gamepads[0].simUpdate(gp1);
            gamepads[1].simUpdate(gp2);
            tick++;
            lock.notifyAll();
            long end = System.currentTimeMillis() + timeoutMs;
            Thread th = opThread;
            while (yielded < tick && th != null && th.isAlive()) {
                long left = end - System.currentTimeMillis();
                if (left <= 0) break;
                try { lock.wait(left); } catch (InterruptedException e) { break; }
            }
        }
    }

    public static Map<String, Object> collectOutputs() {
        Map<String, Object> out = new LinkedHashMap<String, Object>();
        synchronized (outputs) { for (Output o : outputs) o.write(out); }
        return out;
    }

    @SuppressWarnings("unchecked")
    public static Map<String, Object> section(Map<String, Object> out, String key) {
        Object o = out.get(key);
        if (o == null) { o = new LinkedHashMap<String, Object>(); out.put(key, o); }
        return (Map<String, Object>) o;
    }

    public static void addLog(String s) {
        synchronized (log) { log.add(s); if (log.size() > 200) log.remove(0); }
    }
}
