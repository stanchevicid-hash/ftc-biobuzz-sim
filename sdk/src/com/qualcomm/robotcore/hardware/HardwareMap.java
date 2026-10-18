package com.qualcomm.robotcore.hardware;

import android.content.Context;
import java.util.*;

/** Same lookup behaviour (and error messages) as the SDK; devices come from the robot configuration in the browser. */
public class HardwareMap implements Iterable<HardwareDevice> {
    public DeviceMapping<DcMotorController> dcMotorController = new DeviceMapping<DcMotorController>(DcMotorController.class);
    public DeviceMapping<DcMotor> dcMotor = new DeviceMapping<DcMotor>(DcMotor.class);
    public DeviceMapping<ServoController> servoController = new DeviceMapping<ServoController>(ServoController.class);
    public DeviceMapping<Servo> servo = new DeviceMapping<Servo>(Servo.class);
    public DeviceMapping<CRServo> crservo = new DeviceMapping<CRServo>(CRServo.class);
    public DeviceMapping<AnalogInput> analogInput = new DeviceMapping<AnalogInput>(AnalogInput.class);
    public DeviceMapping<DigitalChannel> digitalChannel = new DeviceMapping<DigitalChannel>(DigitalChannel.class);
    public DeviceMapping<TouchSensor> touchSensor = new DeviceMapping<TouchSensor>(TouchSensor.class);
    public DeviceMapping<ColorSensor> colorSensor = new DeviceMapping<ColorSensor>(ColorSensor.class);
    public DeviceMapping<LED> led = new DeviceMapping<LED>(LED.class);
    public DeviceMapping<VoltageSensor> voltageSensor = new DeviceMapping<VoltageSensor>(VoltageSensor.class);
    public final List<DeviceMapping<? extends HardwareDevice>> allDeviceMappings;
    public final Context appContext;

    protected final Map<String, List<HardwareDevice>> allDevicesMap = new LinkedHashMap<String, List<HardwareDevice>>();
    protected final Object lock = new Object();

    public HardwareMap(Context appContext) {
        this.appContext = appContext;
        allDeviceMappings = Arrays.<DeviceMapping<? extends HardwareDevice>>asList(dcMotorController, dcMotor, servoController, servo, crservo,
                analogInput, digitalChannel, touchSensor, colorSensor, led, voltageSensor);
    }

    public <T> T get(Class<? extends T> classOrInterface, String deviceName) {
        T r = tryGet(classOrInterface, deviceName);
        if (r == null) {
            throw new IllegalArgumentException(String.format("Unable to find a hardware device with name \"%s\" and type %s"
                    + "  [simulator: configured devices are %s]", deviceName, classOrInterface.getSimpleName(), describe()));
        }
        return r;
    }

    @SuppressWarnings("unchecked")
    public <T> T tryGet(Class<? extends T> classOrInterface, String deviceName) {
        synchronized (lock) {
            List<HardwareDevice> list = allDevicesMap.get(deviceName.trim());
            if (list != null) for (HardwareDevice d : list) if (classOrInterface.isInstance(d)) return (T) d;
            return null;
        }
    }

    public HardwareDevice get(String deviceName) {
        synchronized (lock) {
            List<HardwareDevice> list = allDevicesMap.get(deviceName.trim());
            if (list != null && !list.isEmpty()) return list.get(0);
        }
        throw new IllegalArgumentException(String.format("Unable to find a hardware device with the name \"%s\"", deviceName));
    }

    @SuppressWarnings("unchecked")
    public <T> List<T> getAll(Class<? extends T> classOrInterface) {
        List<T> r = new ArrayList<T>();
        synchronized (lock) { for (HardwareDevice d : iterateAll()) if (classOrInterface.isInstance(d) && !r.contains(d)) r.add((T) d); }
        return r;
    }

    public SortedSet<String> getAllNames(Class<? extends HardwareDevice> classOrInterface) {
        SortedSet<String> r = new TreeSet<String>();
        synchronized (lock) {
            for (Map.Entry<String, List<HardwareDevice>> e : allDevicesMap.entrySet())
                for (HardwareDevice d : e.getValue()) if (classOrInterface.isInstance(d)) r.add(e.getKey());
        }
        return r;
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    public void put(String deviceName, HardwareDevice device) {
        synchronized (lock) {
            List<HardwareDevice> list = allDevicesMap.get(deviceName);
            if (list == null) { list = new ArrayList<HardwareDevice>(); allDevicesMap.put(deviceName, list); }
            if (!list.contains(device)) list.add(device);
            for (DeviceMapping m : allDeviceMappings) if (m.getDeviceTypeClass().isInstance(device)) m.putLocal(deviceName, device);
        }
    }

    public boolean remove(String deviceName, HardwareDevice device) {
        synchronized (lock) { List<HardwareDevice> l = allDevicesMap.get(deviceName); return l != null && l.remove(device); }
    }

    public Set<String> getNamesOf(HardwareDevice device) {
        Set<String> r = new HashSet<String>();
        synchronized (lock) { for (Map.Entry<String, List<HardwareDevice>> e : allDevicesMap.entrySet()) if (e.getValue().contains(device)) r.add(e.getKey()); }
        return r;
    }

    private List<HardwareDevice> iterateAll() {
        List<HardwareDevice> r = new ArrayList<HardwareDevice>();
        for (List<HardwareDevice> l : allDevicesMap.values()) for (HardwareDevice d : l) if (!r.contains(d)) r.add(d);
        return r;
    }
    public int size() { synchronized (lock) { return iterateAll().size(); } }
    @Override public Iterator<HardwareDevice> iterator() { synchronized (lock) { return iterateAll().iterator(); } }
    public Iterable<HardwareDevice> unsafeIterable() { return iterateAll(); }
    public void logDevices() { ftcsim.Sim.addLog("hardwareMap: " + describe()); }

    public String describe() {
        StringBuilder b = new StringBuilder();
        synchronized (lock) {
            for (Map.Entry<String, List<HardwareDevice>> e : allDevicesMap.entrySet()) {
                if (b.length() > 0) b.append(", ");
                b.append('"').append(e.getKey()).append('"');
                for (HardwareDevice d : e.getValue()) { b.append(" (").append(d.getClass().getSimpleName()).append(')'); break; }
            }
        }
        return b.toString();
    }

    public class DeviceMapping<DEVICE_TYPE extends HardwareDevice> implements Iterable<DEVICE_TYPE> {
        private final Map<String, DEVICE_TYPE> map = new LinkedHashMap<String, DEVICE_TYPE>();
        private final Class<DEVICE_TYPE> deviceTypeClass;
        public DeviceMapping(Class<DEVICE_TYPE> deviceTypeClass) { this.deviceTypeClass = deviceTypeClass; }
        public Class<DEVICE_TYPE> getDeviceTypeClass() { return deviceTypeClass; }
        public DEVICE_TYPE cast(Object obj) { return deviceTypeClass.cast(obj); }
        public DEVICE_TYPE get(String deviceName) {
            synchronized (lock) {
                DEVICE_TYPE d = map.get(deviceName.trim());
                if (d == null) throw new IllegalArgumentException(String.format("Unable to find a hardware device with the name \"%s\"", deviceName));
                return d;
            }
        }
        public void put(String deviceName, DEVICE_TYPE device) { HardwareMap.this.put(deviceName, device); }
        public void putLocal(String deviceName, DEVICE_TYPE device) { synchronized (lock) { map.put(deviceName.trim(), device); } }
        public boolean contains(String deviceName) { synchronized (lock) { return map.containsKey(deviceName); } }
        public boolean remove(String deviceName) { synchronized (lock) { return map.remove(deviceName) != null; } }
        @Override public Iterator<DEVICE_TYPE> iterator() { synchronized (lock) { return new ArrayList<DEVICE_TYPE>(map.values()).iterator(); } }
        public Set<Map.Entry<String, DEVICE_TYPE>> entrySet() { synchronized (lock) { return new LinkedHashMap<String, DEVICE_TYPE>(map).entrySet(); } }
        public int size() { synchronized (lock) { return map.size(); } }
    }
}
