import com.qualcomm.hardware.bosch.BHI260IMU;
import com.qualcomm.hardware.rev.RevHubOrientationOnRobot;
import com.qualcomm.hardware.rev.RevHubOrientationOnRobot.LogoFacingDirection;
import com.qualcomm.hardware.rev.RevHubOrientationOnRobot.UsbFacingDirection;
import com.qualcomm.robotcore.hardware.IMU;
import ftcsim.Json;
import ftcsim.Sim;
import org.firstinspires.ftc.robotcore.external.navigation.AngleUnit;
import org.firstinspires.ftc.robotcore.external.navigation.Quaternion;

import java.util.Map;

/**
 * Runnable check of the simulated SDK math (no browser):
 *   java -jar server/lib/ecj.jar -1.8 -nowarn -cp build/sdk -d build/tests tests/SdkCheck.java
 *   java -cp "build/sdk;build/tests" SdkCheck
 */
public class SdkCheck {
    static int failed = 0;
    static void check(String name, boolean ok, String info) { System.out.println((ok ? "OK   " : "FAIL ") + name + "  " + info); if (!ok) failed++; }

    /** feed the IMU: robot yaw (deg) about world Z, hub really mounted as (logo, usb) */
    static void feed(double yawDeg, String logo, String usb) {
        double h = Math.toRadians(yawDeg) / 2;
        Quaternion m = RevHubOrientationOnRobot.mountQuaternion(logo, usb);
        String js = String.format(java.util.Locale.US, "{\"imu\":{\"imu\":{\"qw\":%f,\"qx\":0,\"qy\":0,\"qz\":%f,\"wx\":0,\"wy\":0,\"wz\":0.5,\"mw\":%f,\"mx\":%f,\"my\":%f,\"mz\":%f}}}",
                Math.cos(h), Math.sin(h), m.w, m.x, m.y, m.z);
        @SuppressWarnings("unchecked") Map<String, Object> s = (Map<String, Object>) Json.parse(js);
        Sim.sensors = s;
    }

    public static void main(String[] a) {
        // 1. hub mounted vertically (logo LEFT, USB UP) and declared correctly: yaw follows the robot
        BHI260IMU imu = new BHI260IMU("imu");
        feed(0, "LEFT", "UP");
        imu.initialize(new IMU.Parameters(new RevHubOrientationOnRobot(LogoFacingDirection.LEFT, UsbFacingDirection.UP)));
        feed(30, "LEFT", "UP");
        double yaw = imu.getRobotYawPitchRollAngles().getYaw(AngleUnit.DEGREES);
        double rate = imu.getRobotAngularVelocity(AngleUnit.RADIANS).zRotationRate;
        check("correct declaration -> yaw 30", Math.abs(yaw - 30) < 0.1, String.format("yaw %.2f, yaw rate %.2f rad/s", yaw, rate));
        check("correct declaration -> yaw rate", Math.abs(rate - 0.5) < 1e-3, String.format("%.3f", rate));
        // 2. same hub, but the OpMode keeps the default LOGO UP / USB FORWARD: heading is wrong, like on a real robot
        BHI260IMU wrong = new BHI260IMU("imu");
        feed(0, "LEFT", "UP");
        wrong.initialize(new IMU.Parameters(new RevHubOrientationOnRobot(LogoFacingDirection.UP, UsbFacingDirection.FORWARD)));
        feed(30, "LEFT", "UP");
        double yawWrong = wrong.getRobotYawPitchRollAngles().getYaw(AngleUnit.DEGREES);
        check("wrong declaration -> wrong yaw", Math.abs(yawWrong - 30) > 5, String.format("yaw %.2f", yawWrong));

        System.out.println(failed == 0 ? "\nall checks passed" : "\n" + failed + " check(s) FAILED");
        System.exit(failed == 0 ? 0 : 1);
    }
}
