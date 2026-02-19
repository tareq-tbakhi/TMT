/**
 * Bridgefy Capacitor Plugin - Objective-C Bridge
 *
 * Required for Capacitor to discover the Swift plugin.
 */

#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(BridgefyPlugin, "Bridgefy",
    CAP_PLUGIN_METHOD(initialize, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(start, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(stop, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(send, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(getStatus, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(getNearbyDevices, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(isBluetoothAvailable, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(requestPermissions, CAPPluginReturnPromise);
)
