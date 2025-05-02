package com.corner;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;

public class MyMathModule extends ReactContextBaseJavaModule {
    public MyMathModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return "MyMathModule";
    }

    @ReactMethod
    public void addNumbers(int a, int b, Promise promise) {
        promise.resolve(a + b);
    }
}
