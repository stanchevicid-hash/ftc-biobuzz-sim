package com.qualcomm.hardware.bosch;

import com.qualcomm.robotcore.hardware.IMU;
import ftcsim.Json;
import ftcsim.Sim;
import ftcsim.SimDevice;
import org.firstinspires.ftc.robotcore.external.navigation.*;

import java.util.Map;

/**
 * Simulated Control Hub IMU. The physics reports the robot orientation (FTC robot axes: X right, Y forward, Z up)
 * as a quaternion. Like the real IMU, yaw is zeroed at initialize()/resetYaw() and the configured hub
 * orientation is assumed to be correct.
 */
public class BHI260IMU extends SimDevice implements IMU {
    private volatile double yawOffset = 0;
    private volatile boolean initialized = false;
    private volatile Quaternion declared = Quaternion.identityQuaternion();   // what the OpMode says (IMU.Parameters)

    public BHI260IMU(String name) { super(name); }

    private Map<String, Object> raw() { return Sim.dev("imu", name); }
    /** how the hub is really mounted (robot config), sent by the physics as "mw..mz" */
    private Quaternion actual() {
        Map<String, Object> m = raw();
        return new Quaternion((float) Json.num(m.get("mw"), 1), (float) Json.num(m.get("mx"), 0), (float) Json.num(m.get("my"), 0), (float) Json.num(m.get("mz"), 0), 0);
    }
    /** robot orientation as the IMU computes it: physical hub orientation corrected by the DECLARED mounting.
     *  If the OpMode declares the wrong logo/USB directions, the angles come out wrong - like on the real robot. */
    private Quaternion worldQuat() {
        Map<String, Object> m = raw();
        Quaternion robot = new Quaternion((float) Json.num(m.get("qw"), 1), (float) Json.num(m.get("qx"), 0), (float) Json.num(m.get("qy"), 0), (float) Json.num(m.get("qz"), 0), Sim.nanoTime());
        return robot.multiply(actual(), 0).multiply(declared.inverse(), Sim.nanoTime()).normalized();
    }
    private Quaternion robotQuat() {
        double h = -yawOffset / 2;
        Quaternion z = new Quaternion((float) Math.cos(h), 0, 0, (float) Math.sin(h), 0);
        return z.multiply(worldQuat(), Sim.nanoTime()).normalized();
    }
    private double rawYaw() {
        Orientation o = worldQuat().toOrientation(AxesReference.INTRINSIC, AxesOrder.ZXY, AngleUnit.RADIANS);
        return o.firstAngle;
    }

    @Override public boolean initialize(Parameters parameters) {
        if (parameters != null && parameters.imuOrientationOnRobot != null) declared = parameters.imuOrientationOnRobot.imuCoordinateSystemOrientationFromPerspectiveOfRobot();
        initialized = true; yawOffset = rawYaw(); return true;
    }
    @Override public void resetYaw() { yawOffset = rawYaw(); }
    @Override public YawPitchRollAngles getRobotYawPitchRollAngles() {
        Orientation o = robotQuat().toOrientation(AxesReference.INTRINSIC, AxesOrder.ZXY, AngleUnit.DEGREES);
        return new YawPitchRollAngles(AngleUnit.DEGREES, o.firstAngle, o.secondAngle, o.thirdAngle, Sim.nanoTime());
    }
    @Override public Orientation getRobotOrientation(AxesReference reference, AxesOrder order, AngleUnit angleUnit) {
        Orientation o = robotQuat().toOrientation(reference, order, angleUnit); o.acquisitionTime = Sim.nanoTime(); return o;
    }
    @Override public Quaternion getRobotOrientationAsQuaternion() { return robotQuat(); }
    @Override public AngularVelocity getRobotAngularVelocity(AngleUnit u) {
        Map<String, Object> m = raw();
        // gyro measures in the hub frame; the SDK rotates it back with the declared mounting
        org.firstinspires.ftc.robotcore.external.matrices.VectorF w = new org.firstinspires.ftc.robotcore.external.matrices.VectorF(
                (float) Json.num(m.get("wx"), 0), (float) Json.num(m.get("wy"), 0), (float) Json.num(m.get("wz"), 0));
        w = declared.applyToVector(actual().inverse().applyToVector(w));
        UnnormalizedAngleUnit n = u.getUnnormalized();
        return new AngularVelocity(n, (float) n.fromRadians(w.get(0)), (float) n.fromRadians(w.get(1)), (float) n.fromRadians(w.get(2)), Sim.nanoTime());
    }
    @Override public Manufacturer getManufacturer() { return Manufacturer.Bosch; }
    @Override public String getDeviceName() { return "Simulated IMU"; }
}
