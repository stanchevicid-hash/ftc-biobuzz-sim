package com.qualcomm.robotcore.hardware;

import org.firstinspires.ftc.robotcore.external.navigation.DistanceUnit;

public interface DistanceSensor extends HardwareDevice {
    double distanceOutOfRange = Double.MAX_VALUE;
    double getDistance(DistanceUnit unit);
}
