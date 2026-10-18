package com.qualcomm.robotcore.hardware;

import ftcsim.Sim;

/** Simulated analog port; the physics provides "v" (e.g. an Axon servo encoder or a potentiometer). */
public class AnalogInput implements HardwareDevice {
    private final AnalogInputController controller;
    private final int channel;
    private String simName;

    public AnalogInput(AnalogInputController controller, int channel) { this.controller = controller; this.channel = channel; }
    public AnalogInput simName(String name) { this.simName = name; return this; }

    @Override public Manufacturer getManufacturer() { return Manufacturer.Lynx; }
    public double getVoltage() {
        if (simName != null) return Sim.num("analog", simName, "v", 0);
        return controller != null ? controller.getAnalogInputVoltage(channel) : 0;
    }
    public double getMaxVoltage() { return 3.3; }
    @Override public String getDeviceName() { return "Analog Input"; }
    @Override public String getConnectionInfo() { return "sim; analog port " + channel; }
    @Override public int getVersion() { return 1; }
    @Override public void resetDeviceConfigurationForOpMode() {}
    @Override public void close() {}
}
