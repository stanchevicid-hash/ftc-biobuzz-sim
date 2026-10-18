package com.qualcomm.robotcore.hardware;

import ftcsim.Sim;

import java.util.LinkedHashMap;
import java.util.Map;

public class CRServoImpl implements CRServo, Sim.Output {
    protected final String name;
    protected final int port;
    protected volatile Direction direction = Direction.FORWARD;
    protected volatile double power;
    protected volatile boolean pwmEnabled = true;

    public CRServoImpl(String name, int port) { this.name = name; this.port = port; }

    @Override public void write(Map<String, Object> out) {
        Map<String, Object> m = new LinkedHashMap<String, Object>();
        m.put("p", pwmEnabled ? (direction == Direction.FORWARD ? power : -power) : 0.0);
        Sim.section(out, "crservos").put(name, m);
    }
    @Override public ServoController getController() { return null; }
    @Override public int getPortNumber() { return port; }
    @Override public void setDirection(Direction d) { direction = d; }
    @Override public Direction getDirection() { return direction; }
    @Override public void setPower(double p) { power = Math.max(-1, Math.min(1, p)); }
    @Override public double getPower() { return power; }
    @Override public Manufacturer getManufacturer() { return Manufacturer.Lynx; }
    @Override public String getDeviceName() { return "Simulated Continuous Rotation Servo"; }
    @Override public String getConnectionInfo() { return "sim; port " + port; }
    @Override public int getVersion() { return 1; }
    @Override public void resetDeviceConfigurationForOpMode() { direction = Direction.FORWARD; }
    @Override public void close() { power = 0; }
}
