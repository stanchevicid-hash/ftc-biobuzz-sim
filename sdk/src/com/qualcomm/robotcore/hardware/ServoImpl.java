package com.qualcomm.robotcore.hardware;

import ftcsim.Sim;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Simulated positional servo. Like the real one, it has no position until setPosition() is called
 * (the physics then leaves the joint limp) and getPosition() returns the last commanded value, not a measurement.
 */
public class ServoImpl implements Servo, Sim.Output {
    protected final String name;
    protected final int port;
    protected volatile Direction direction = Direction.FORWARD;
    protected volatile double position = Double.NaN;
    protected volatile double limitMin = MIN_POSITION, limitMax = MAX_POSITION;
    protected volatile boolean pwmEnabled = true;

    public ServoImpl(String name, int port) { this.name = name; this.port = port; }

    /** position actually sent to the servo, 0..1 of its full range */
    protected double physical() {
        double p = position;
        if (Double.isNaN(p)) return Double.NaN;
        if (direction == Direction.REVERSE) p = 1 - p;
        return limitMin + p * (limitMax - limitMin);
    }

    @Override public void write(Map<String, Object> out) {
        Map<String, Object> m = new LinkedHashMap<String, Object>();
        double ph = physical();
        m.put("pos", Double.isNaN(ph) || !pwmEnabled ? null : ph);
        Sim.section(out, "servos").put(name, m);
    }

    @Override public ServoController getController() { return null; }
    @Override public int getPortNumber() { return port; }
    @Override public void setDirection(Direction d) { direction = d; }
    @Override public Direction getDirection() { return direction; }
    @Override public void setPosition(double p) { position = Math.max(MIN_POSITION, Math.min(MAX_POSITION, p)); pwmEnabled = true; }
    @Override public double getPosition() { return Double.isNaN(position) ? 0 : position; }
    @Override public void scaleRange(double min, double max) {
        min = Math.max(MIN_POSITION, Math.min(MAX_POSITION, min));
        max = Math.max(MIN_POSITION, Math.min(MAX_POSITION, max));
        if (min >= max) throw new IllegalArgumentException("min must be less than max");
        limitMin = min; limitMax = max;
    }
    @Override public Manufacturer getManufacturer() { return Manufacturer.Lynx; }
    @Override public String getDeviceName() { return "Simulated Servo"; }
    @Override public String getConnectionInfo() { return "sim; port " + port; }
    @Override public int getVersion() { return 1; }
    @Override public void resetDeviceConfigurationForOpMode() { limitMin = MIN_POSITION; limitMax = MAX_POSITION; direction = Direction.FORWARD; }
    @Override public void close() {}
}
