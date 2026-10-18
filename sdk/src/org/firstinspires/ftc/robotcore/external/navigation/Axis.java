package org.firstinspires.ftc.robotcore.external.navigation;

public enum Axis { X(0), Y(1), Z(2), UNKNOWN(-1);
    public final int index;
    Axis(int index) { this.index = index; } }
