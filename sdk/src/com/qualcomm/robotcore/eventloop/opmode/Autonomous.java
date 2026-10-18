package com.qualcomm.robotcore.eventloop.opmode;

import java.lang.annotation.*;

@Documented
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
public @interface Autonomous {
    String name() default "";
    String group() default "";
    String preselectTeleOp() default "";
}
