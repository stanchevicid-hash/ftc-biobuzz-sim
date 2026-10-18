package ftcsim;

import com.qualcomm.hardware.bosch.BHI260IMU;
import com.qualcomm.hardware.gobilda.GoBildaPinpointDriver;
import com.qualcomm.hardware.limelightvision.Limelight3A;
import com.qualcomm.hardware.lynx.LynxModule;
import com.qualcomm.hardware.rev.Rev2mDistanceSensor;
import com.qualcomm.hardware.rev.RevColorSensorV3;
import com.qualcomm.hardware.rev.RevTouchSensor;
import com.qualcomm.robotcore.eventloop.opmode.LinearOpMode;
import com.qualcomm.robotcore.eventloop.opmode.OpMode;
import com.qualcomm.robotcore.hardware.*;
import com.qualcomm.robotcore.hardware.configuration.typecontainers.MotorConfigurationType;

import java.util.*;

/** Runs one OpMode the way the Robot Controller does: INIT -> (init_loop) -> START -> loop -> STOP. */
public final class Runner {
    private Runner() {}

    public static volatile String state = "idle";          // idle | init | running | stopped | error
    public static volatile Map<String, Object> error;
    public static volatile String opModeName = "";
    public static Set<String> userFiles = new HashSet<String>();
    private static volatile boolean ended = true;

    public static synchronized void init(final Class<?> cls, List<Object> devices, String name) throws Exception {
        stop();
        Sim.reset();
        error = null; opModeName = name;
        final HardwareMap hw = buildHardwareMap(devices);
        final OpMode op = (OpMode) cls.getDeclaredConstructor().newInstance();
        op.simAttach(hw);
        ended = false;
        Thread t = new Thread(new Runnable() { public void run() { runOpMode(op); } }, "OpModeThread");
        t.setDaemon(true);
        Sim.opThread = t;
        state = "init";
        t.start();
    }

    private static void runOpMode(OpMode op) {
        try {
            if (op instanceof LinearOpMode) {
                ((LinearOpMode) op).runOpMode();
            } else {
                op.init(); op.telemetry.update();
                while (!Sim.started && !Sim.stopRequested) { op.simTick(); op.init_loop(); op.telemetry.update(); Sim.barrier(); }
                if (!Sim.stopRequested) {
                    op.resetRuntime(); op.start();
                    while (!Sim.stopRequested) { op.simTick(); op.loop(); op.telemetry.update(); Sim.barrier(); }
                }
                op.stop(); op.telemetry.update();
            }
            if (!"error".equals(state)) state = "stopped";
        } catch (OpModeTerminated e) {
            state = "stopped";
        } catch (InterruptedException e) {
            state = "stopped";
        } catch (ThreadDeath e) {
            state = "stopped";
        } catch (Throwable e) {
            if (Sim.stopRequested && (e instanceof RuntimeException) && e.getCause() instanceof InterruptedException) { state = "stopped"; }
            else { error = describe(e); state = "error"; }
        } finally {
            ended = true;
        }
    }

    public static void start() { if ("init".equals(state)) { Sim.started = true; state = "running"; } }

    @SuppressWarnings("deprecation")
    public static synchronized void stop() {
        Thread t = Sim.opThread;
        Sim.stopRequested = true;
        if (t != null && t.isAlive()) {
            t.interrupt();
            try { t.join(1500); } catch (InterruptedException ignored) {}
            if (t.isAlive()) {
                Sim.addLog("E: OpMode stuck in stop() — the real Robot Controller would restart here. Force-stopping the thread.");
                try { t.stop(); } catch (Throwable ignored) {}
            }
        }
        if (!"error".equals(state) && !"idle".equals(state)) state = "stopped";
        ended = true;
    }

    /** Commands for the physics. Once the OpMode has ended all motors stop, like the real SDK. */
    public static Map<String, Object> outputs() {
        if (ended || !(state.equals("init") || state.equals("running"))) return new LinkedHashMap<String, Object>();
        return Sim.collectOutputs();
    }

    static Map<String, Object> describe(Throwable e) {
        Map<String, Object> m = new LinkedHashMap<String, Object>();
        Throwable root = e;
        m.put("type", e.getClass().getName());
        m.put("message", String.valueOf(e.getMessage()));
        List<Object> frames = new ArrayList<Object>();
        StringBuilder text = new StringBuilder(e.toString());
        for (Throwable c = e; c != null; c = c.getCause() == c ? null : c.getCause()) {
            if (c != e) text.append("\nCaused by: ").append(c);
            for (StackTraceElement s : c.getStackTrace()) {
                boolean user = s.getFileName() != null && userFiles.contains(s.getFileName());
                if (user) {
                    Map<String, Object> f = new LinkedHashMap<String, Object>();
                    f.put("file", s.getFileName()); f.put("line", s.getLineNumber()); f.put("method", s.getClassName() + "." + s.getMethodName());
                    frames.add(f);
                }
                if (user || s.getClassName().startsWith("com.qualcomm") || s.getClassName().startsWith("org.firstinspires"))
                    text.append("\n    at ").append(s);
            }
            root = c;
        }
        m.put("frames", frames);
        m.put("text", text.toString());
        return m;
    }

    static HardwareMap buildHardwareMap(List<Object> devices) {
        HardwareMap hw = new HardwareMap(new android.app.Activity());
        hw.put("Control Hub", new LynxModule("Control Hub", true, 173));
        hw.put("Expansion Hub 2", new LynxModule("Expansion Hub 2", false, 2));
        hw.put("Control Hub", new SimVoltageSensor());
        boolean hasImu = false;
        int motorPort = 0, servoPort = 0, other = 0;
        for (Object o : devices) {
            Map<String, Object> d = Json.obj(o);
            String name = Json.str(d.get("name"), "").trim();
            String type = Json.str(d.get("type"), "");
            if (name.isEmpty()) continue;
            HardwareDevice dev;
            if (type.equals("motor")) {
                MotorConfigurationType mt = new MotorConfigurationType(Json.str(d.get("model"), "motor"),
                        Json.num(d.get("ticksPerRev"), 28), Json.num(d.get("maxRPM"), 6000), Json.num(d.get("gearing"), 1));
                dev = new DcMotorImplEx(name, motorPort++ % 4, mt);
            } else if (type.equals("servo")) dev = new ServoImplEx(name, servoPort++ % 6);
            else if (type.equals("crservo")) dev = new CRServoImplEx(name, servoPort++ % 6);
            else if (type.equals("imu")) { dev = new BHI260IMU(name); hasImu = true; }
            else if (type.equals("distance")) dev = new Rev2mDistanceSensor(name);
            else if (type.equals("color")) dev = new RevColorSensorV3(name);
            else if (type.equals("touch")) dev = new RevTouchSensor(name);
            else if (type.equals("analog")) dev = new AnalogInput(null, other++).simName(name);
            else if (type.equals("webcam")) dev = new SimWebcam(name);
            else if (type.equals("pinpoint")) dev = new GoBildaPinpointDriver(null, true).simName(name);
            else if (type.equals("limelight")) dev = new Limelight3A(name);
            else if (type.equals("led")) dev = new LED(name);
            else continue;
            hw.put(name, dev);
            if (dev instanceof Sim.Output) synchronized (Sim.outputs) { Sim.outputs.add((Sim.Output) dev); }
        }
        if (!hasImu) hw.put("imu", new BHI260IMU("imu"));
        return hw;
    }
}
