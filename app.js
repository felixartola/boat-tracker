let watchID = null;
let isTracking = false;
let arcgisCredential;
let tripID;
let pathCoordinates = [];
let isManualMode = false;
let showHistory = false;
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

    const originalFilters = new Map();

    function applyTripFilter() {
        webmap.allLayers.forEach(function (layer) {
            if (layer.type !== "feature") return;
            layer.load().then(function () {
                const tripField = (layer.fields || []).find(function (field) {
                    return field.name.toLowerCase() === "trip_id";
                });
                if (!tripField) return;
                if (!originalFilters.has(layer)) {
                    originalFilters.set(layer, layer.definitionExpression || "");
                }
                let tripFilter = "";
                if (!showHistory) {
                    tripFilter = tripID
                        ? tripField.name + " = '" + String(tripID).replace(/'/g, "''") + "'"
                        : "1=0";
                }
                const parts = [originalFilters.get(layer), tripFilter].filter(Boolean);
                layer.definitionExpression = parts.length
                    ? parts.map(function (part) { return "(" + part + ")"; }).join(" AND ")
                    : null;
            }).catch(function (error) {
                logMessage("Could not filter layer " + layer.title + ": " + error.message, true);
            });
        });
    }

    function syncHistoryButton() {
        document.getElementById("historyButton").textContent =
            showHistory ? "Hide Past Paths" : "Show Past Paths";
        document.getElementById("historyStatus").textContent =
            showHistory ? "All trips" : "Current trip only";
    }

    view.when(function () {
        applyTripFilter();
    });

    document.getElementById("historyButton").addEventListener("click", function () {
        showHistory = !showHistory;
        syncHistoryButton();
        applyTripFilter();
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
            flushAll();
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
                flushAll();
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
        applyTripFilter();
        pathCoordinates = [];
        pointRecords = [];
        document.getElementById("pointCount").textContent = "0";
        document.getElementById("pathStatus").textContent = "No path yet";
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

    const pendingKey = "boatTrackerPending";
    let pendingPoints = [];
    let pendingDeletes = [];
    let tripPaths = {};
    let nextPointNumber = 0;
    const sendingPointIds = new Set();
    const undoneWhileSending = new Set();
    const uploadedObjectIds = {};
    const pathsInFlight = new Set();
    let pointsFlushing = false;
    let connectionOk = true;

    try {
        const stored = JSON.parse(localStorage.getItem(pendingKey) || "null");
        if (stored) {
            pendingPoints = stored.points || [];
            pendingDeletes = stored.deletes || [];
            tripPaths = stored.paths || {};
        }
    } catch (error) {
        logMessage("Could not read saved upload queue: " + error.message, true);
    }

    function savePending() {
        try {
            localStorage.setItem(pendingKey, JSON.stringify({
                points: pendingPoints,
                deletes: pendingDeletes,
                paths: tripPaths
            }));
        } catch (error) {
            logMessage("Could not save upload queue: " + error.message, true);
        }
    }

    function updatePendingDisplay() {
        const waiting = pendingPoints.length + pendingDeletes.length;
        document.getElementById("pendingCount").textContent =
            waiting === 0 ? "0" : waiting + (connectionOk ? "" : " (offline)");
        document.getElementById("pendingCount").classList.toggle("data-warning", waiting > 0 && !connectionOk);
    }

    function markConnectionLost(error) {
        if (connectionOk) {
            logMessage("Connection problem, will keep retrying: " + error.message, true);
        }
        connectionOk = false;
    }

    function markConnectionRestored() {
        if (!connectionOk) {
            logMessage("Connection restored");
        }
        connectionOk = true;
    }

    function getTripPath(id) {
        if (!tripPaths[id]) {
            tripPaths[id] = { coords: [], objectId: null, dirty: false, version: 0 };
        }
        return tripPaths[id];
    }

    function setCurrentPath(coords) {
        const path = getTripPath(tripID);
        path.coords = coords.slice();
        path.dirty = true;
        path.version += 1;
    }

    function removeFromList(list, value) {
        const index = list.indexOf(value);
        if (index !== -1) list.splice(index, 1);
    }

    function pointToGraphic(item) {
        return new Graphic({
            geometry: {
                type: "point",
                longitude: item.longitude,
                latitude: item.latitude,
                spatialReference: {
                    wkid: 4326
                }
            },
            attributes: {
                esrignss_fixdatetime: item.time,
                esrignss_h_rms: item.accuracy,
                trip_id: item.tripID
            }
        });
    }

    function addPointToTrip(longitude, latitude, accuracy) {

        nextPointNumber += 1;
        const item = {
            id: tripID + "_" + Date.now() + "_" + nextPointNumber,
            tripID: tripID,
            longitude: longitude,
            latitude: latitude,
            accuracy: accuracy,
            time: Date.now()
        };

        pendingPoints.push(item);
        pointRecords.push(item.id);
        pathCoordinates.push([longitude, latitude]);
        setCurrentPath(pathCoordinates);

        document.getElementById("pointCount").textContent = pathCoordinates.length;
        logMessage("Point #" + pathCoordinates.length + " recorded (trip " + tripID + ")");

        savePending();
        updatePendingDisplay();
        syncUndoButton();
        flushAll();
    }

    function flushAll() {
        flushPoints();
        flushPaths();
    }

    function flushPoints() {

        if (pointsFlushing || !arcgisCredential) return;
        if (pendingPoints.length === 0 && pendingDeletes.length === 0) return;

        pointsFlushing = true;
        const batch = pendingPoints.slice(0, 100);
        const deletes = pendingDeletes.slice();
        let succeeded = false;
        batch.forEach(function (item) { sendingPointIds.add(item.id); });

        const addStep = batch.length === 0 ? Promise.resolve() :
            boatLayer.applyEdits({
                addFeatures: batch.map(pointToGraphic)
            }).then(function (result) {
                let saved = 0;
                result.addFeatureResults.forEach(function (addResult, index) {
                    const item = batch[index];
                    removeFromList(pendingPoints, item);
                    if (addResult.error) {
                        logMessage("Point save REJECTED by server: " +
                            JSON.stringify(addResult.error), true);
                        undoneWhileSending.delete(item.id);
                        return;
                    }
                    saved += 1;
                    uploadedObjectIds[item.id] = addResult.objectId;
                    if (undoneWhileSending.has(item.id)) {
                        undoneWhileSending.delete(item.id);
                        pendingDeletes.push(addResult.objectId);
                    }
                });
                if (saved > 0) {
                    logMessage("Uploaded " + saved + " point(s) to boat_gps");
                    refreshMapLayer(boatLayer.url);
                }
            });

        addStep.then(function () {
            if (deletes.length === 0) return;
            return boatLayer.applyEdits({
                deleteFeatures: deletes.map(function (objectId) {
                    return { objectId: objectId };
                })
            }).then(function (result) {
                result.deleteFeatureResults.forEach(function (deleteResult, index) {
                    removeFromList(pendingDeletes, deletes[index]);
                    if (deleteResult.error) {
                        logMessage("Point DELETE rejected by server: " +
                            JSON.stringify(deleteResult.error), true);
                    } else {
                        logMessage("Point removed, OBJECTID " + deletes[index]);
                    }
                });
                refreshMapLayer(boatLayer.url);
            });
        }).then(function () {
            succeeded = true;
            markConnectionRestored();
        }).catch(function (error) {
            markConnectionLost(error);
        }).then(function () {
            pointsFlushing = false;
            batch.forEach(function (item) { sendingPointIds.delete(item.id); });
            savePending();
            updatePendingDisplay();
            if (succeeded) flushPoints();
        });
    }

    function flushPaths() {

        if (!arcgisCredential) return;

        Object.keys(tripPaths).forEach(function (id) {
            const path = tripPaths[id];

            if (!path.dirty) {
                if (id !== tripID) delete tripPaths[id];
                return;
            }
            if (pathsInFlight.has(id)) return;

            const version = path.version;
            const coords = path.coords.slice();
            let edits;

            if (path.objectId === null) {
                if (coords.length < 2) {
                    path.dirty = false;
                    return;
                }
                edits = {
                    addFeatures: [new Graphic({
                        geometry: { type: "polyline", paths: [coords], spatialReference: { wkid: 4326 } },
                        attributes: { trip_id: id }
                    })]
                };
            } else if (coords.length < 2) {
                edits = { deleteFeatures: [{ objectId: path.objectId }] };
            } else {
                edits = {
                    updateFeatures: [new Graphic({
                        geometry: { type: "polyline", paths: [coords], spatialReference: { wkid: 4326 } },
                        attributes: { OBJECTID: path.objectId, trip_id: id }
                    })]
                };
            }

            pathsInFlight.add(id);
            let succeeded = false;

            pathLayer.applyEdits(edits).then(function (result) {
                const editResult = (result.addFeatureResults[0] ||
                    result.updateFeatureResults[0] || result.deleteFeatureResults[0]);
                if (editResult.error) {
                    logMessage("Path save rejected by server (trip " + id + "): " +
                        JSON.stringify(editResult.error), true);
                    path.dirty = false;
                    return;
                }
                if (edits.addFeatures) {
                    path.objectId = editResult.objectId;
                } else if (edits.deleteFeatures) {
                    path.objectId = null;
                }
                if (path.version === version) path.dirty = false;
                succeeded = true;
                markConnectionRestored();
                if (id === tripID) {
                    document.getElementById("pathStatus").textContent = path.objectId === null
                        ? "No path yet"
                        : "Saved (" + coords.length + " points)";
                }
                logMessage("Path saved (trip " + id + ", " + coords.length + " points)");
                refreshMapLayer(pathLayer.url);
            }).catch(function (error) {
                markConnectionLost(error);
                if (id === tripID) {
                    document.getElementById("pathStatus").textContent = "Waiting for connection";
                }
            }).then(function () {
                pathsInFlight.delete(id);
                savePending();
                if (succeeded && path.dirty) flushPaths();
            });
        });
    }

    window.addEventListener("online", flushAll);
    setInterval(flushAll, 15000);
    updatePendingDisplay();

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

        document.getElementById("status").textContent = "Tracking stopped";
        isTracking = false;
        syncTrackingButton();
    }

    function undoLastPoint() {

        if (!isManualMode || pathCoordinates.length === 0) return;

        const pointId = pointRecords.pop();
        pathCoordinates.pop();
        setCurrentPath(pathCoordinates);
        document.getElementById("pointCount").textContent = pathCoordinates.length;
        document.getElementById("manualStatus").textContent =
            "Point undone (" + pathCoordinates.length + " left)";

        const queued = pendingPoints.find(function (item) { return item.id === pointId; });
        if (queued && !sendingPointIds.has(pointId)) {
            removeFromList(pendingPoints, queued);
            logMessage("Point removed before upload");
        } else if (uploadedObjectIds[pointId] !== undefined) {
            pendingDeletes.push(uploadedObjectIds[pointId]);
            delete uploadedObjectIds[pointId];
        } else {
            undoneWhileSending.add(pointId);
        }

        savePending();
        updatePendingDisplay();
        syncUndoButton();
        flushAll();
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
        applyTripFilter();
        pathCoordinates = [];
        pointRecords = [];
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
