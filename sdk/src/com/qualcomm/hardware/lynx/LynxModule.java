package com.qualcomm.hardware.lynx;

import com.qualcomm.robotcore.hardware.HardwareDevice;
import ftcsim.Json;
import ftcsim.Sim;
import org.firstinspires.ftc.robotcore.external.navigation.CurrentUnit;
import org.firstinspires.ftc.robotcore.external.navigation.VoltageUnit;

/** Simulated REV hub. Bulk caching is accepted; reads are always fresh once per simulation tick anyway. */
public class LynxModule implements HardwareDevice {
    public enum BulkCachingMode { OFF, MANUAL, AUTO }
    private final String name; private final boolean parent; private final int address;
    private BulkCachingMode bulkCachingMode = BulkCachingMode.OFF;
    private int ledColor = 0xFF00FF00;

    public LynxModule(String name, boolean parent, int address) { this.name = name; this.parent = parent; this.address = address; }
    public BulkCachingMode getBulkCachingMode() { return bulkCachingMode; }
    public void setBulkCachingMode(BulkCachingMode mode) { bulkCachingMode = mode; }
    public void clearBulkCache() {}
    public double getInputVoltage(VoltageUnit unit) { return unit.convert(Json.num(Sim.sensors.get("battery"), 12.8), VoltageUnit.VOLTS); }
    public double getAuxiliaryVoltage(VoltageUnit unit) { return unit.convert(5.0, VoltageUnit.VOLTS); }
    public double getCurrent(CurrentUnit unit) { return unit.convert(Json.num(Sim.sensors.get("totalCurrent"), 0), CurrentUnit.AMPS); }
    public double getGpioBusCurrent(CurrentUnit unit) { return 0; }
    public double getI2cBusCurrent(CurrentUnit unit) { return 0; }
    public void setConstant(int color) { ledColor = color; }
    public void stopBlinking() {}
    public boolean isParent() { return parent; }
    public int getModuleAddress() { return address; }
    public String getFirmwareVersionString() { return "sim 1.8.2"; }
    public Manufacturer getManufacturer() { return Manufacturer.Lynx; }
    public String getDeviceName() { return name; }
    public String getConnectionInfo() { return "sim; module " + address; }
    public int getVersion() { return 1; }
    public void resetDeviceConfigurationForOpMode() {}
    public void close() {}
}
