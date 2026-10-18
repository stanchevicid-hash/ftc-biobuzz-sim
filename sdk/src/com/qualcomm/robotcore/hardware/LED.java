package com.qualcomm.robotcore.hardware;

import ftcsim.Sim;
import java.util.Map;

public class LED implements HardwareDevice, SwitchableLight, Sim.Output {
    private final String name; private volatile boolean on;
    public LED(String name) { this.name = name; }
    public void enable(boolean set) { on = set; }
    public void on() { on = true; }
    public void off() { on = false; }
    @Override public void enableLight(boolean enable) { on = enable; }
    @Override public boolean isLightOn() { return on; }
    @Override public void write(Map<String, Object> out) { Sim.section(out, "leds").put(name, on); }
    @Override public Manufacturer getManufacturer() { return Manufacturer.Other; }
    @Override public String getDeviceName() { return "LED"; }
    @Override public String getConnectionInfo() { return "sim"; }
    @Override public int getVersion() { return 1; }
    @Override public void resetDeviceConfigurationForOpMode() {}
    @Override public void close() {}
}
