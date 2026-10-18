package ftcsim;

import com.qualcomm.robotcore.hardware.HardwareDevice;

/** Base for simple simulated sensors. */
public abstract class SimDevice implements HardwareDevice {
    protected final String name;
    protected SimDevice(String name) { this.name = name; }
    public String simName() { return name; }
    public Manufacturer getManufacturer() { return Manufacturer.Other; }
    public String getDeviceName() { return getClass().getSimpleName(); }
    public String getConnectionInfo() { return "sim"; }
    public int getVersion() { return 1; }
    public void resetDeviceConfigurationForOpMode() {}
    public void close() {}
}
