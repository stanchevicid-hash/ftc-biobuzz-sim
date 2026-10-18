package com.qualcomm.robotcore.hardware;

import com.qualcomm.robotcore.hardware.configuration.typecontainers.MotorConfigurationType;
import ftcsim.Sim;

import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;

/** Simulated motor. Encoder offset and direction are handled here; closed-loop modes run in the physics ("hub firmware"). */
public class DcMotorImpl implements DcMotor, Sim.Output {
    protected final String name;
    protected final int port;
    protected MotorConfigurationType motorType;
    protected volatile Direction direction = Direction.FORWARD;
    protected volatile RunMode mode = RunMode.RUN_WITHOUT_ENCODER;
    protected volatile ZeroPowerBehavior zeroPowerBehavior = ZeroPowerBehavior.BRAKE;
    protected volatile double power;
    protected volatile Double velocityTarget;      // ticks/s in user direction, set via setVelocity
    protected volatile int targetPosition;
    protected volatile double encoderOffset;       // raw ticks
    protected volatile boolean enabled = true;
    protected volatile int tolerance = 5;
    protected volatile PIDFCoefficients velPidf = new PIDFCoefficients(10, 3, 0, 0);
    protected volatile PIDFCoefficients posPidf = new PIDFCoefficients(10, 0, 0, 0);

    public DcMotorImpl(String name, int port, MotorConfigurationType type) {
        this.name = name; this.port = port; this.motorType = type;
        encoderOffset = rawPos();
    }

    protected int sign() { return direction == Direction.FORWARD ? 1 : -1; }
    protected double rawPos() { return Sim.num("motors", name, "pos", 0); }
    protected double rawVel() { return Sim.num("motors", name, "vel", 0); }

    @Override public void write(Map<String, Object> out) {
        Map<String, Object> m = new LinkedHashMap<String, Object>();
        int s = sign();
        double maxTps = motorType.getAchieveableMaxTicksPerSecond();
        RunMode md = mode;
        if (!enabled || md == RunMode.STOP_AND_RESET_ENCODER) {
            m.put("mode", "power"); m.put("p", 0.0);
        } else if (md == RunMode.RUN_TO_POSITION) {
            m.put("mode", "position");
            m.put("tp", encoderOffset + s * (double) targetPosition);
            Double vt = velocityTarget;
            m.put("vmax", vt != null ? Math.abs(vt) : Math.abs(power) * maxTps);
        } else if (md == RunMode.RUN_USING_ENCODER) {
            Double vt = velocityTarget;
            m.put("mode", "velocity");
            m.put("tv", s * (vt != null ? vt : power * maxTps));
        } else {
            m.put("mode", "power"); m.put("p", s * power);
        }
        m.put("brake", zeroPowerBehavior != ZeroPowerBehavior.FLOAT);
        PIDFCoefficients v = velPidf;
        m.put("vpidf", Arrays.asList(v.p, v.i, v.d, v.f));
        m.put("pp", posPidf.p);
        m.put("maxTps", maxTps);
        Sim.section(out, "motors").put(name, m);
    }

    @Override public MotorConfigurationType getMotorType() { return motorType; }
    @Override public void setMotorType(MotorConfigurationType t) { motorType = t; }
    @Override public DcMotorController getController() { return null; }
    @Override public int getPortNumber() { return port; }
    @Override public void setZeroPowerBehavior(ZeroPowerBehavior z) { if (z != ZeroPowerBehavior.UNKNOWN) zeroPowerBehavior = z; }
    @Override public ZeroPowerBehavior getZeroPowerBehavior() { return zeroPowerBehavior; }
    @Override @Deprecated public void setPowerFloat() { setZeroPowerBehavior(ZeroPowerBehavior.FLOAT); setPower(0); }
    @Override public boolean getPowerFloat() { return zeroPowerBehavior == ZeroPowerBehavior.FLOAT && power == 0; }
    @Override public void setTargetPosition(int position) { targetPosition = position; }
    @Override public int getTargetPosition() { return targetPosition; }
    @Override public boolean isBusy() {
        return mode == RunMode.RUN_TO_POSITION && enabled && Math.abs(getCurrentPosition() - targetPosition) > tolerance;
    }
    @Override public int getCurrentPosition() { return (int) Math.round(sign() * (rawPos() - encoderOffset)); }
    @Override public void setMode(RunMode m) {
        m = m.migrate();
        if (m == RunMode.STOP_AND_RESET_ENCODER) { encoderOffset = rawPos(); power = 0; velocityTarget = null; }
        mode = m;
    }
    @Override public RunMode getMode() { return mode; }
    @Override public void setDirection(Direction d) { direction = d; }
    @Override public Direction getDirection() { return direction; }
    @Override public void setPower(double p) {
        if (Double.isNaN(p)) throw new IllegalArgumentException("power must be a number, not NaN (motor \"" + name + "\")");
        power = Math.max(-1, Math.min(1, p)); velocityTarget = null;
    }
    @Override public double getPower() {
        Double vt = velocityTarget;
        if (vt != null) return vt / motorType.getAchieveableMaxTicksPerSecond();
        return power;
    }
    @Override public Manufacturer getManufacturer() { return Manufacturer.Lynx; }
    @Override public String getDeviceName() { return "Simulated Motor (" + motorType.getName() + ")"; }
    @Override public String getConnectionInfo() { return "sim; port " + port; }
    @Override public int getVersion() { return 1; }
    @Override public void resetDeviceConfigurationForOpMode() {}
    @Override public void close() { setPower(0); }
}
