package org.firstinspires.ftc.teamcode;

import android.graphics.Color;
import com.qualcomm.hardware.gobilda.GoBildaPinpointDriver;
import com.qualcomm.robotcore.eventloop.opmode.OpMode;
import com.qualcomm.robotcore.eventloop.opmode.TeleOp;
import com.qualcomm.robotcore.hardware.DistanceSensor;
import com.qualcomm.robotcore.hardware.NormalizedColorSensor;
import com.qualcomm.robotcore.hardware.NormalizedRGBA;
import com.qualcomm.robotcore.hardware.TouchSensor;
import com.qualcomm.robotcore.hardware.VoltageSensor;
import org.firstinspires.ftc.robotcore.external.navigation.AngleUnit;
import org.firstinspires.ftc.robotcore.external.navigation.DistanceUnit;
import org.firstinspires.ftc.robotcore.external.navigation.Pose2D;

/** Iterative OpMode (init / init_loop / start / loop) that shows every simulated sensor of the demo robot. */
@TeleOp(name = "Sensor Dashboard", group = "Demo")
public class SensorDashboard extends OpMode {
    DistanceSensor rear;
    NormalizedColorSensor color;
    TouchSensor liftLimit;
    GoBildaPinpointDriver pinpoint;
    VoltageSensor battery;
    final float[] hsv = new float[3];

    @Override
    public void init() {
        rear = hardwareMap.get(DistanceSensor.class, "rearDistance");
        color = hardwareMap.get(NormalizedColorSensor.class, "intakeColor");
        color.setGain(8);
        liftLimit = hardwareMap.get(TouchSensor.class, "liftLimit");
        pinpoint = hardwareMap.get(GoBildaPinpointDriver.class, "pinpoint");
        pinpoint.setOffsets(-84.0, -168.0, DistanceUnit.MM);
        pinpoint.setEncoderResolution(GoBildaPinpointDriver.GoBildaOdometryPods.goBILDA_4_BAR_POD);
        pinpoint.setEncoderDirections(GoBildaPinpointDriver.EncoderDirection.FORWARD, GoBildaPinpointDriver.EncoderDirection.FORWARD);
        pinpoint.resetPosAndIMU();
        battery = hardwareMap.voltageSensor.iterator().next();
    }

    @Override
    public void init_loop() {
        telemetry.addData("Status", "init_loop, %.1f s", getRuntime());
    }

    @Override
    public void loop() {
        pinpoint.update();
        Pose2D pose = pinpoint.getPosition();
        NormalizedRGBA c = color.getNormalizedColors();
        Color.colorToHSV(c.toColor(), hsv);
        String ball = c.alpha < 0.05 ? "none" : (hsv[0] > 35 && hsv[0] < 80 ? "POLLEN (yellow)" : hsv[0] < 20 || hsv[0] > 330 ? "red NECTAR" : hsv[0] > 190 && hsv[0] < 260 ? "blue NECTAR" : "?");
        telemetry.addData("Pinpoint", "x %.1f in  y %.1f in  h %.1f deg", pose.getX(DistanceUnit.INCH), pose.getY(DistanceUnit.INCH), pose.getHeading(AngleUnit.DEGREES));
        telemetry.addData("Rear distance", "%.1f cm", rear.getDistance(DistanceUnit.CM));
        telemetry.addData("Intake color", "h %.0f s %.2f v %.2f  a %.3f -> %s", hsv[0], hsv[1], hsv[2], c.alpha, ball);
        telemetry.addData("Lift at bottom", liftLimit.isPressed());
        telemetry.addData("Battery", "%.2f V", battery.getVoltage());
        telemetry.addData("Gamepad1", gamepad1.toString());
    }
}
