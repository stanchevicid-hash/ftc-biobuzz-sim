package com.qualcomm.hardware.rev;

import com.qualcomm.robotcore.hardware.*;
import ftcsim.Sim;
import ftcsim.SimDevice;
import org.firstinspires.ftc.robotcore.external.navigation.DistanceUnit;

import java.util.Map;

/** Simulated REV Color Sensor V3: colour of whatever is a few cm in front of it, plus its proximity distance. */
public class RevColorSensorV3 extends SimDevice implements ColorSensor, NormalizedColorSensor, DistanceSensor, SwitchableLight {
    private float gain = 1;
    private boolean light = true;
    private I2cAddr addr = I2cAddr.create7bit(0x52);
    public RevColorSensorV3(String name) { super(name); }

    private double ch(String c) { return Sim.num("color", name, c, 0); } // 0..1 normalized at gain 1
    private int raw(String c) { return (int) Math.max(0, Math.min(65535, Math.round(ch(c) * gain * 4096))); }
    @Override public int red() { return raw("r"); }
    @Override public int green() { return raw("g"); }
    @Override public int blue() { return raw("b"); }
    @Override public int alpha() { return raw("a"); }
    @Override public int argb() { NormalizedRGBA c = getNormalizedColors(); return c.toColor(); }
    @Override public void enableLed(boolean enable) { light = enable; }
    @Override public void setI2cAddress(I2cAddr a) { addr = a; }
    @Override public I2cAddr getI2cAddress() { return addr; }
    @Override public NormalizedRGBA getNormalizedColors() {
        NormalizedRGBA n = new NormalizedRGBA();
        n.red = (float) Math.min(1, ch("r") * gain); n.green = (float) Math.min(1, ch("g") * gain);
        n.blue = (float) Math.min(1, ch("b") * gain); n.alpha = (float) Math.min(1, ch("a") * gain);
        return n;
    }
    @Override public float getGain() { return gain; }
    @Override public void setGain(float g) { gain = g; }
    @Override public double getDistance(DistanceUnit unit) {
        double m = Sim.num("color", name, "d", -1);
        return unit.fromMeters(m < 0 ? 0.06 : Math.min(m, 0.06)); // the V3 proximity saturates around 6 cm
    }
    public double getLightDetected() { return Math.min(1, ch("a") * gain); }
    public double getRawLightDetected() { return alpha(); }
    public double getRawLightDetectedMax() { return 65535; }
    @Override public void enableLight(boolean enable) { light = enable; }
    @Override public boolean isLightOn() { return light; }
    @Override public Manufacturer getManufacturer() { return Manufacturer.Broadcom; }
    @Override public String getDeviceName() { return "REV Color Sensor v3"; }
}
