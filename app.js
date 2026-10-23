let watchID = null;
let isTracking = false;
let arcgisCredential;
let tripID;
let pathCoordinates = [];
let pathObjectID = null;
let pathCreationInProgress = false;
let isManualMode = false;
let pointRecords = [];
let debugPanelOpen = false;

const portalURL = "https://www.arcgis.com";
const clientID = "MpbbtiE8vXvj6by6";

function syncTrackingButton() {
    const button = document.getElementById("trackingButton");
    button.textContent = isTracking ? "Stop Tracking" : "Start Tracking";
    button.className = isTracking ? "btn btn-danger btn-lg" : "btn btn-success btn-lg";
}

function syncManualButton() {
    const button = document.getElementById("manualButton");
    button.textContent = isManualMode ? "Finish Manual Trip" : "Start Manual Trip";
    button.className = isManualMode ? "btn btn-danger btn-lg" : "btn btn-primary btn-lg";
    document.getElementById("map").classList.toggle("manual-mode", isManualMode);
    syncUndoButton();
}

function syncUndoButton() {
    document.getElementById("undoButton").disabled =
        !isManualMode || pathCoordinates.length === 0;
}

function logMessage(message, isError) {
    const logDiv = document.getElementById("debugLog");
    const time = new Date().toLocaleTimeString();
    const line = document.createElement("div");
    line.textContent = "[" + time + "] " + message;
    if (isError) {
        line.classList.add("log-error");
        console.error(message);
    } else {
        console.log(message);
    }
    logDiv.appendChild(line);
    logDiv.scrollTop = logDiv.scrollHeight;
}

function togglePanel(panelId, toggleId) {
    const panel = document.getElementById(panelId);
    const toggle = document.getElementById(toggleId);
    const icon = toggle.querySelector(".toggle-icon");
    const isOpen = panel.classList.contains("open");
    if (isOpen) {
        panel.classList.remove("open");
        icon.textContent = "▶";
    } else {
        panel.classList.add("open");
        icon.textContent = "▼";
    }
}

function toggleDebugPanel() {
    const panel = document.getElementById("debugPanel");
    const toggle = document.getElementById("debugToggle");
    debugPanelOpen = !debugPanelOpen;
    
    if (debugPanelOpen) {
        panel.classList.add("open");
        toggle.querySelector(".debug-toggle-icon").textContent = "▼";
    } else {
        panel.classList.remove("open");
        toggle.querySelector(".debug-toggle-icon").textContent = "▶";
    }
}

document.getElementById("locationToggle").addEventListener("click", function () {
    togglePanel("locationPanel", "locationToggle");
});

document.getElementById("pathToggle").addEventListener("click", function () {
    togglePanel("pathPanel", "pathToggle");
});

document.getElementById("debugToggle").addEventListener("click", toggleDebugPanel);

document.getElementById("clearLogButton").addEventListener("click", function () {
    document.getElementById("debugLog").innerHTML = "";
});

require([
    "esri/WebMap",
    "esri/views/MapView",
    "esri/identity/OAuthInfo",
    "esri/identity/IdentityManager",
    "esri/layers/FeatureLayer",
    "esri/Graphic"
], function (WebMap, MapView, OAuthInfo, esriId, FeatureLayer, Graphic) {

    const webmap = new WebMap({
        portalItem: {
            id: "03cf7e425e824638b4cd7c932396cf84"
        }
    });

    const view = new MapView({
        container: "map",
        map: webmap
    });

    const info = new OAuthInfo({
        appId: clientID,
        portalUrl: portalURL,
        popup: false
    });

    esriId.registerOAuthInfos([info]);

    const boatLayer = new FeatureLayer({
        url: "https://services1.arcgis.com/ug7Y0GY6kYE0tf0p/arcgis/rest/services/boat_gps/FeatureServer/0"
    });
    const pathLayer = new FeatureLayer({
        url: "https://services1.arcgis.com/ug7Y0GY6kYE0tf0p/arcgis/rest/services/boat_tracks/FeatureServer/0"
    });

    esriId.checkSignInStatus(portalURL + "/sharing")
        .then(function (credential) {
            arcgisCredential = credential;
            document.getElementById("arcgisStatus").textContent = "Signed in";
            document.getElementById("arcgisStatus").className = "status-badge status-online";
        })
        .catch(function () {
        });

    document.getElementById("signInButton").addEventListener("click", function () {
        esriId.getCredential(portalURL + "/sharing")
            .then(function (credential) {
                arcgisCredential = credential;
                document.getElementById("arcgisStatus").textContent = "Signed in";
                document.getElementById("arcgisStatus").className = "status-badge status-online";
                document.getElementById("signInButton").disabled = true;
            })
            .catch(function (error) {
                logMessage("Sign-in failed: " + error.message, true);
            });
    });

    function startTracking() {

        if (isManualMode) {
            document.getElementById("status").textContent =
                "Finish the manual trip before tracking.";
            return;
        }

        if (!arcgisCredential) {
            document.getElementById("status").textContent =
                "Please sign in to ArcGIS before tracking.";
            isTracking = false;
            syncTrackingButton();
            return;
        }

        if (!navigator.geolocation) {
            document.getElementById("status").textContent =
                "Geolocation is not supported by this browser.";
            isTracking = false;
            syncTrackingButton();
            return;
        }

        if (watchID !== null) {
            navigator.geolocation.clearWatch(watchID);
        }

        tripID = Date.now().toString();
        pathCoordinates = [];
        pointRecords = [];
        pathObjectID = null;
        pathCreationInProgress = false;
        document.getElementById("status").textContent = "Tracking...";

        watchID = navigator.geolocation.watchPosition(
            locationSuccess,
            locationError,
            {
                enableHighAccuracy: true
            }
        );

        isTracking = true;
        syncTrackingButton();
    }

    function refreshMapLayer(serviceUrl) {
        webmap.allLayers.forEach(function (layer) {
            if (layer.url && serviceUrl.indexOf(layer.url) === 0 &&
                typeof layer.refresh === "function") {
                layer.refresh();
            }
        });
    }

    function showLocation(latitude, longitude, accuracy) {
        document.getElementById("latitude").textContent = latitude.toFixed(6);
        document.getElementById("longitude").textContent = longitude.toFixed(6);
        document.getElementById("accuracy").textContent =
            accuracy === null ? "Manual" : Math.round(accuracy);
        document.getElementById("time").textContent = new Date().toLocaleTimeString();
    }

    function locationSuccess(position) {

        if (!isTracking) return;

        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        const accuracy = position.coords.accuracy;

        showLocation(latitude, longitude, accuracy);
        addPointToTrip(longitude, latitude, accuracy);
    }

    function addPointToTrip(longitude, latitude, accuracy) {

        const boatPosition = new Graphic({
            geometry: {
                type: "point",
                longitude: longitude,
                latitude: latitude,
                spatialReference: {
                    wkid: 4326
                }
            },
            attributes: {
                esrignss_fixdatetime: Date.now(),
                esrignss_h_rms: accuracy,
                trip_id: tripID
            }
        });

        pathCoordinates.push([longitude, latitude]);

        logMessage("Attempting to save point #" + pathCoordinates.length + " (trip " + tripID + ")");

        const record = {};
        pointRecords.push(record);

        record.saved = boatLayer.applyEdits({
            addFeatures: [boatPosition]
        })
            .then(function (result) {
                if (result.addFeatureResults[0].error) {
                    logMessage("Point save REJECTED by server: " +
                        JSON.stringify(result.addFeatureResults[0].error), true);
                    return null;
                }
                document.getElementById("pointCount").textContent = pathCoordinates.length;
                logMessage("Point saved to boat_gps layer, OBJECTID " +
                    result.addFeatureResults[0].objectId);
                refreshMapLayer(boatLayer.url);
                return result.addFeatureResults[0].objectId;
            })
            .catch(function (error) {
                logMessage("Point save request FAILED: " + error.message, true);
                return null;
            });

        syncUndoButton();

        if (pathCoordinates.length >= 2) {
            savePath();
        }
    }

    function savePath() {

        const pointsSent = pathCoordinates.length;
        const sentTripID = tripID;
        const path = {
            type: "polyline",
            paths: [pathCoordinates.slice()],
            spatialReference: {
                wkid: 4326
            }
        };

        if (pathObjectID === null) {

            if (pathCreationInProgress) {
                logMessage("Path creation already in progress, point queued.");
                return;
            }
            pathCreationInProgress = true;

            const newPath = new Graphic({
                geometry: path,
                attributes: {
                    trip_id: sentTripID
                }
            });

            logMessage("Attempting to CREATE path feature (trip " + sentTripID + ")");

            pathLayer.applyEdits({
                addFeatures: [newPath]
            })
                .then(function (result) {
                    pathCreationInProgress = false;
                    const addResult = result.addFeatureResults[0];
                    if (addResult.error) {
                        logMessage("Path CREATE rejected by server: " +
                            JSON.stringify(addResult.error), true);
                        document.getElementById("pathStatus").textContent = "Create failed";
                    } else {
                        logMessage("Path created, OBJECTID " + addResult.objectId);
                        document.getElementById("pathStatus").textContent =
                            "Created (OBJECTID " + addResult.objectId + ")";
                        refreshMapLayer(pathLayer.url);
                        if (sentTripID !== tripID) return;
                        pathObjectID = addResult.objectId;
                        if (pathCoordinates.length < 2) {
                            deletePath();
                        } else if (pathCoordinates.length !== pointsSent) {
                            savePath();
                        }
                    }
                })
                .catch(function (error) {
                    pathCreationInProgress = false;
                    logMessage("Path CREATE request failed: " + error.message, true);
                    document.getElementById("pathStatus").textContent = "Create failed";
                });

        } else {

            const updatedPath = new Graphic({
                geometry: path,
                attributes: {
                    OBJECTID: pathObjectID,
                    trip_id: sentTripID
                }
            });

            pathLayer.applyEdits({
                updateFeatures: [updatedPath]
            })
                .then(function (result) {
                    const updateResult = result.updateFeatureResults[0];
                    if (updateResult.error) {
                        logMessage("Path UPDATE rejected by server: " +
                            JSON.stringify(updateResult.error), true);
                        document.getElementById("pathStatus").textContent = "Update failed";
                    } else {
                        logMessage("Path updated (" + pointsSent + " points)");
                        document.getElementById("pathStatus").textContent =
                            "Updated (" + pointsSent + " points)";
                        refreshMapLayer(pathLayer.url);
                    }
                })
                .catch(function (error) {
                    logMessage("Path UPDATE request failed: " + error.message, true);
                    document.getElementById("pathStatus").textContent = "Update failed";
                });
        }
    }

    function locationError(error) {
        document.getElementById("status").textContent =
            "Location error: " + error.message;
        logMessage("Geolocation error: " + error.message, true);

        if (watchID !== null) {
            navigator.geolocation.clearWatch(watchID);
            watchID = null;
        }
        
        isTracking = false;
        syncTrackingButton();
    }

    function stopTracking() {
        if (watchID !== null) {
            navigator.geolocation.clearWatch(watchID);
            watchID = null;
        }

        pathCreationInProgress = false;
        document.getElementById("status").textContent = "Tracking stopped";
        isTracking = false;
        syncTrackingButton();
    }

    function deletePath() {
        const objectId = pathObjectID;
        pathObjectID = null;
        pathLayer.applyEdits({
            deleteFeatures: [{ objectId: objectId }]
        })
            .then(function (result) {
                const deleteResult = result.deleteFeatureResults[0];
                if (deleteResult.error) {
                    logMessage("Path DELETE rejected by server: " +
                        JSON.stringify(deleteResult.error), true);
                } else {
                    logMessage("Path removed (fewer than 2 points left)");
                    document.getElementById("pathStatus").textContent = "No path yet";
                    refreshMapLayer(pathLayer.url);
                }
            })
            .catch(function (error) {
                logMessage("Path DELETE request failed: " + error.message, true);
            });
    }

    function undoLastPoint() {

        if (!isManualMode || pathCoordinates.length === 0) return;

        const record = pointRecords.pop();
        pathCoordinates.pop();
        document.getElementById("pointCount").textContent = pathCoordinates.length;
        document.getElementById("manualStatus").textContent =
            "Point undone (" + pathCoordinates.length + " left)";
        syncUndoButton();

        record.saved.then(function (objectId) {
            if (objectId === null) return;
            return boatLayer.applyEdits({
                deleteFeatures: [{ objectId: objectId }]
            })
                .then(function (result) {
                    const deleteResult = result.deleteFeatureResults[0];
                    if (deleteResult.error) {
                        logMessage("Point DELETE rejected by server: " +
                            JSON.stringify(deleteResult.error), true);
                    } else {
                        logMessage("Point removed, OBJECTID " + objectId);
                        refreshMapLayer(boatLayer.url);
                    }
                });
        }).catch(function (error) {
            logMessage("Point DELETE request failed: " + error.message, true);
        });

        if (pathCoordinates.length >= 2) {
            savePath();
        } else if (pathObjectID !== null) {
            deletePath();
        }
    }

    function startManualTrip() {

        if (!arcgisCredential) {
            document.getElementById("manualStatus").textContent =
                "Please sign in to ArcGIS first.";
            return;
        }

        if (isTracking) {
            document.getElementById("manualStatus").textContent =
                "Stop tracking before adding manual points.";
            return;
        }

        tripID = "manual_" + Date.now();
        pathCoordinates = [];
        pointRecords = [];
        pathObjectID = null;
        pathCreationInProgress = false;
        document.getElementById("pointCount").textContent = "0";
        document.getElementById("pathStatus").textContent = "No path yet";
        document.getElementById("manualStatus").textContent = "Click the map to add points";
        logMessage("Manual trip started (trip " + tripID + ")");

        isManualMode = true;
        syncManualButton();
    }

    function finishManualTrip() {
        isManualMode = false;
        document.getElementById("manualStatus").textContent =
            "Finished (" + pathCoordinates.length + " points)";
        logMessage("Manual trip finished (trip " + tripID + ")");
        syncManualButton();
    }

    view.on("click", function (event) {
        if (!isManualMode) return;
        event.stopPropagation();

        const latitude = event.mapPoint.latitude;
        const longitude = event.mapPoint.longitude;

        showLocation(latitude, longitude, null);
        addPointToTrip(longitude, latitude, null);
        document.getElementById("manualStatus").textContent =
            pathCoordinates.length + " point(s) added";
    });

    document.getElementById("undoButton").addEventListener("click", undoLastPoint);

    document.getElementById("manualButton").addEventListener("click", function () {
        if (isManualMode) {
            finishManualTrip();
        } else {
            startManualTrip();
        }
    });

    syncTrackingButton();

    document.getElementById("trackingButton").addEventListener("click", function () {
        if (isTracking) {
            stopTracking();
        } else {
            startTracking();
        }
    });

});
