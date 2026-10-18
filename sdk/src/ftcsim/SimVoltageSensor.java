package ftcsim;

import com.qualcomm.robotcore.hardware.VoltageSensor;

public class SimVoltageSensor implements VoltageSensor {
    public double getVoltage() { return Json.num(Sim.sensors.get("battery"), 12.8); }
    public Manufacturer getManufacturer() { return Manufacturer.Lynx; }
    public String getDeviceName() { return "Control Hub voltage"; }
    public String getConnectionInfo() { return "sim"; }
    public int getVersion() { return 1; }
    public void resetDeviceConfigurationForOpMode() {}
    public void close() {}
}
