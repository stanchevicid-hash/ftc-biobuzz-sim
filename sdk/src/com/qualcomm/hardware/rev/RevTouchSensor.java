package com.qualcomm.hardware.rev;

import com.qualcomm.robotcore.hardware.DigitalChannel;
import com.qualcomm.robotcore.hardware.DigitalChannelController;
import com.qualcomm.robotcore.hardware.TouchSensor;
import ftcsim.Json;
import ftcsim.Sim;
import ftcsim.SimDevice;

/** Works both as TouchSensor and as DigitalChannel (getState() == true means NOT pressed, like the real REV sensor). */
public class RevTouchSensor extends SimDevice implements TouchSensor, DigitalChannel {
    private Mode mode = Mode.INPUT;
    public RevTouchSensor(String name) { super(name); }
    @Override public boolean isPressed() { return Json.bool(Json.obj(Sim.sensors.get("touch")).get(name)); }
    @Override public double getValue() { return isPressed() ? 1 : 0; }
    @Override public Mode getMode() { return mode; }
    @Override public void setMode(Mode m) { mode = m; }
    @Override public boolean getState() { return !isPressed(); }
    @Override public void setState(boolean state) {}
    @Override @Deprecated public void setMode(DigitalChannelController.Mode m) { mode = m.migrate(); }
    @Override public Manufacturer getManufacturer() { return Manufacturer.Lynx; }
    @Override public String getDeviceName() { return "REV Touch Sensor"; }
}
