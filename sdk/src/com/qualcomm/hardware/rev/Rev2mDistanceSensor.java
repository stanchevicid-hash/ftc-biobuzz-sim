package com.qualcomm.hardware.rev;

import com.qualcomm.robotcore.hardware.DistanceSensor;
import ftcsim.Sim;
import ftcsim.SimDevice;
import org.firstinspires.ftc.robotcore.external.navigation.DistanceUnit;

/** Simulated REV 2m distance sensor (time-of-flight). Out of range reads as 8.19 m, like the real one. */
public class Rev2mDistanceSensor extends SimDevice implements DistanceSensor {
    public Rev2mDistanceSensor(String name) { super(name); }
    @Override public double getDistance(DistanceUnit unit) {
        double m = Sim.num("distance", name, "d", -1);
        if (m < 0) m = 8.19;
        return unit.fromMeters(m);
    }
    public boolean didTimeoutOccur() { return false; }
    public byte getModelID() { return (byte) 0xEE; }
    @Override public Manufacturer getManufacturer() { return Manufacturer.STMicroelectronics; }
    @Override public String getDeviceName() { return "REV 2M ToF Distance Sensor"; }
}
