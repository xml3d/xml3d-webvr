(function() {
    /*************************************************************************/
    /*                                                                       */
    /*  camera.js                                                            */
    /*  Simple navigation for XML3D scenes                                   */
    /*                                                                       */
    /*  Copyright (C) 2015                                                   */
    /*  DFKI - German Research Center for Artificial Intelligence            */
    /*                                                                       */
    /*  xml3d.js is free software; you can redistribute it and/or modify     */
    /*  under the terms of the GNU General Public License as                 */
    /*  published by the Free Software Foundation; either version 2 of       */
    /*  the License, or (at your option) any later version.                  */
    /*                                                                       */
    /*  xml3d.js is distributed in the hope that it will be useful, but      */
    /*  WITHOUT ANY WARRANTY; without even the implied warranty of           */
    /*  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.                 */
    /*  See the GNU General Public License                                   */
    /*  (http://www.fsf.org/licensing/licenses/gpl.html) for more details.   */
    /*                                                                       */
    /*************************************************************************/

    /**
     * This simple camera controller provides two interaction modes:
     *      examine : The camera revolves around the examinePoint
     *      fly     : The camera has free movement through the scene
     *
     * Available options are:
     *      {string} mode The interaction mode as described above. Defaults to 'examine'
     *      {Vec3} examinePoint The point the camera revolves around if in examine mode
     *      {number} rotateSpeed The rotation speed! Default: 3
     *      {number} zoomSpeed The zoom speed in some arbitrary units, Default: 20
     *      {bool} useKeys Toggle WSAD keyboard control, Default: false
     *
     * More documentation here:
     * https://github.com/xml3d/xml3d.js/wiki/StandardCamera-(camera.js)
     *
     */

    if(!XML3D)
        throw("XML3D not found, please ensure the camera script is included after xml3d.js");

    /**
     * The StandardCamera offers basic mouse and touch interaction with an XML3D scene.
     *
     * @param {HTMLElement} element The element that this camera will control
     * @param {Object} opt
     * @constructor
     */
    XML3D.StandardCamera = function(element, opt) {
        if (!element || !element.tagName) {
            throw("Must provide an element to control when initializing the StandardCamera!");
        }
        if (element.hasAttribute("style")) {
            XML3D.debug.logWarning("This camera controller does not support CSS transforms, unexpected things may happen! Try using a <transform> element instead.");
        }
        if (XML3D.StandardCamera.Instance) {
            XML3D.StandardCamera.Instance.detach();
        }
        XML3D.StandardCamera.Instance = false; // Prevent the camera from self-initializing

        opt = opt || {};
        this.element = element;
        this.xml3d = this.getXML3DForElement(element);

        this.mode = opt.mode || "examine";
        this.touchTranslateMode = opt.touchTranslateMode || "twofinger";

        this.examinePoint = opt.examinePoint || this.getInverseTranslationOfParent(element);
        this.rotateSpeed = opt.rotateSpeed || 3;
        this.zoomSpeed = opt.zoomSpeed || 20;
        this.useKeys = opt.useKeys !== undefined ? opt.useKeys : false;
        this.mousemovePicking = true;
        this.activeKeys = {};

        this.transformInterface = new TransformInterface(this.element, this.xml3d);
        this.prevPos = {x: -1, y: -1};
        this.prevTouchPositions = [];
        this.prevTouchPositions[0] = {
            x : -1,
            y : -1
        };
        this.prevZoomVectorLength = null;
        this.upVector = this.transformInterface.upVector;

        this.attach();
    };

    /**
     * Translate the camera by the given vector
     * @param {XML3D.Vec3} vec The vector to translate the camera by
     */
    XML3D.StandardCamera.prototype.translate = function(vec) {
        this.transformInterface.translate(vec);
    };

    /**
     * Rotate the camera with the given quaternion rotation
     * @param {XML3D.Quat} rot The quaternion rotation to rotate the camera with
     */
    XML3D.StandardCamera.prototype.rotate = function(rot) {
        this.transformInterface.rotate(rot);
    };

    /**
     * Moves the camera to a new position and orientation that centers on the given object. After calling this the camera
     * will be positioned in front of the object looking down the Z axis at it. The camera will be placed far enough away
     * that the whole object is visible. If in examine mode the examine point will be set to the center of the object.
     *
     * @param {HTMLElement} element The element to be examined. May be a <group>, <mesh> or <model> tag.
     */
    XML3D.StandardCamera.prototype.examine = function(element) {
        if (!element.getWorldBoundingBox) {
            XML3D.debug.logError(element + " is not a valid examine target. Valid target elements include <group>, <mesh> and <model>.");
            return;
        }
        var bb = element.getWorldBoundingBox();
        var center = bb.center();
        var r = center.len();
        var newPos = center.clone();
        newPos.z += r / Math.tan(this.transformInterface.fieldOfView / 2);
        this.transformInterface.position = newPos;
        this.transformInterface.orientation = new XML3D.Quat();
        this.examinePoint = bb.center();
    };

    /**
     * Sets the examine point of the camera. This has no effect if the camera is in "fly" mode.
     * @param p The new examine point
     */
    XML3D.StandardCamera.prototype.setExaminePoint = function(p) {
        this.examinePoint = p;
    };

    /**
     * Orient the camera to look at the given point
     *
     * @param {XML3D.Vec3} point
     */
    XML3D.StandardCamera.prototype.lookAt = function(point) {
        this.transformInterface.lookAt(point);
    };

    /**
     * Start listening for input events.
     */
    XML3D.StandardCamera.prototype.attach = function() {
        var self = this;
        this._evt_mousedown = function(e) {self.mousePressEvent(e);};
        this._evt_mouseup = function(e) {self.mouseReleaseEvent(e);};
        this._evt_mousemove = function(e) {self.mouseMoveEvent(e);};
        this._evt_contextmenu = function(e) {e.preventDefault();e.stopPropagation();};
        this._evt_keydown = function(e) {self.keyHandling.call(self, e, "down");};
        this._evt_keyup = function(e) {self.keyHandling.call(self, e, "up");};

        this._evt_touchstart = function(e) {self.touchStartEvent(e);};
        this._evt_touchmove = function(e) {self.touchMoveEvent(e);};
        this._evt_touchend = function(e) {self.touchEndEvent(e);};
        this._evt_touchcancel = function(e) {self.touchEndEvent(e);};


        this.xml3d.addEventListener("mousedown", this._evt_mousedown, false);
        document.addEventListener("mouseup", this._evt_mouseup, false);
        document.addEventListener("mousemove",this._evt_mousemove, false);

        this.xml3d.addEventListener("touchstart", this._evt_touchstart, false);
        document.addEventListener("touchend", this._evt_touchend, false);
        document.addEventListener("touchmove",this._evt_touchmove, false);
        document.addEventListener("touchcancel", this._evt_touchend, false);

        this.xml3d.addEventListener("contextmenu", this._evt_contextmenu, false);
        if (this.useKeys) {
            document.addEventListener("keydown", this._evt_keydown, false);
            document.addEventListener("keyup", this._evt_keyup, false);
        }
    };

    /**
     * Stop listening for input events.
     */
    XML3D.StandardCamera.prototype.detach = function() {
        this.xml3d.removeEventListener("mousedown", this._evt_mousedown, false);
        document.removeEventListener("mouseup", this._evt_mouseup, false);
        document.removeEventListener("mousemove",this._evt_mousemove, false);

        this.xml3d.removeEventListener("touchstart", this._evt_touchstart, false);
        document.removeEventListener("touchend", this._evt_touchend, false);
        document.removeEventListener("touchmove",this._evt_touchmove, false);
        document.removeEventListener("touchcancel", this._evt_touchend, false);

        this.xml3d.removeEventListener("contextmenu", this._evt_contextmenu, false);
        if (this.useKeys) {
            document.removeEventListener("keydown", this._evt_keydown, false);
            document.removeEventListener("keyup", this._evt_keyup, false);
        }
    };


    //---------- End public API ----------------

    Object.defineProperty(XML3D.StandardCamera.prototype, "width", {
        get : function() {
            return this.xml3d.width;
        }
    });
    Object.defineProperty(XML3D.StandardCamera.prototype, "height", {
        get : function() {
            return this.xml3d.height;
        }
    });

    XML3D.StandardCamera.prototype.getXML3DForElement = function(element) {
        var node = element.parentNode;
        while (node && node.localName !== "xml3d") {
            node = node.parentNode;
        }
        if (!node) {
            throw("Could not find the root XML3D element for the given element.");
        }
        return node;
    };

    XML3D.StandardCamera.prototype.getInverseTranslationOfParent = function(element) {
        if (!element.parentElement.getWorldMatrix) {
            return new XML3D.Vec3(0,0,0);
        }
        var tmat = element.parentElement.getWorldMatrix();
        tmat = tmat.invert();
        return new XML3D.Vec3(tmat.m41, tmat.m42, tmat.m43);
    };

    XML3D.StandardCamera.prototype.NO_MOUSE_ACTION = "no_action";
    XML3D.StandardCamera.prototype.TRANSLATE = "translate";
    XML3D.StandardCamera.prototype.DOLLY = "dolly";
    XML3D.StandardCamera.prototype.ROTATE = "rotate";
    XML3D.StandardCamera.prototype.LOOKAROUND = "lookaround";

    XML3D.StandardCamera.prototype.mousePressEvent = function(event) {
        // This listener captures events on the XML3D element only
        var ev = event || window.event;
        event.preventDefault(); // Prevent text dragging

        switch (ev.button) {
            case 0:
                if(this.mode == "examine")
                    this.action = this.ROTATE;
                else
                    this.action = this.LOOKAROUND;
                break;
            case 1:
                this.action = this.TRANSLATE;
                break;
            case 2:
                this.action = this.DOLLY;
                break;
            default:
                this.action = this.NO_MOUSE_ACTION;
        }

        this.prevPos.x = ev.pageX;
        this.prevPos.y = ev.pageY;

        if (this.action !== this.NO_MOUSE_ACTION) {
            //Disable object picking during camera actions
            this.mousemovePicking = XML3D.options.getValue("renderer-mousemove-picking");
            XML3D.options.setValue("renderer-mousemove-picking", false);
        }
    };

    XML3D.StandardCamera.prototype.mouseReleaseEvent = function(event) {
        if (this.action !== this.NO_MOUSE_ACTION) {
            XML3D.options.setValue("renderer-mousemove-picking", this.mousemovePicking);
        }

        this.action = this.NO_MOUSE_ACTION;
    };

    XML3D.StandardCamera.prototype.mouseMoveEvent = function(event) {
        var ev = event || window.event;

        if (!this.action)
            return;
        var dx, dy, mx, my;
        switch(this.action) {
            case(this.TRANSLATE):
                var f = 2.0* Math.tan(this.transformInterface.fieldOfView/2.0) / this.height;
                dx = f*(ev.pageX - this.prevPos.x) * this.zoomSpeed;
                dy = f*(ev.pageY - this.prevPos.y) * this.zoomSpeed;
                var trans = new XML3D.Vec3(-dx, dy, 0.0);
                trans = this.transformInterface.inverseTransformOf(trans);
                this.transformInterface.translate(trans);
                this.examinePoint = this.examinePoint.add(trans);
                break;
            case(this.DOLLY):
                dy = this.zoomSpeed * (ev.pageY - this.prevPos.y) / this.height;
                this.transformInterface.translate(this.transformInterface.inverseTransformOf(new XML3D.Vec3(0, 0, dy)));
                break;
            case(this.ROTATE):
                dx = -this.rotateSpeed*0.1 * (ev.pageX - this.prevPos.x) * 2.0 * Math.PI / this.width;
                dy = -this.rotateSpeed*0.1 * (ev.pageY - this.prevPos.y) * 2.0 * Math.PI / this.height;

                mx = XML3D.Quat.fromAxisAngle([0,1,0], dx);
                my = XML3D.Quat.fromAxisAngle([1,0,0], dy);
                mx = mx.mul(my);
                this.transformInterface.rotateAroundPoint(mx, this.examinePoint);
                break;
            case(this.LOOKAROUND):
                dx = -this.rotateSpeed*0.1 * (ev.pageX - this.prevPos.x) * 2.0 * Math.PI / this.width;
                dy = this.rotateSpeed*0.1 * (ev.pageY - this.prevPos.y) * 2.0 * Math.PI / this.height;
                var cross = this.upVector.cross(this.transformInterface.direction);

                mx = XML3D.Quat.fromAxisAngle( this.upVector , dx);
                my = XML3D.Quat.fromAxisAngle( cross , dy);

                this.transformInterface.lookAround(mx, my, this.upVector);
                break;
        }

        if (this.action != this.NO_MOUSE_ACTION)
        {
            this.prevPos.x = ev.pageX;
            this.prevPos.y = ev.pageY;
        }
    };


    // -----------------------------------------------------
    // touch rotation and movement
    // -----------------------------------------------------

    XML3D.StandardCamera.prototype.touchStartEvent = function(event) {
        // This listener captures events on the XML3D element only
        var ev = event || window.event;

        switch (ev.touches.length) {
            case 1:
                if(this.mode == "examine")
                    this.action = this.ROTATE;
                else
                    this.action = this.LOOKAROUND;
                break;
            case 2:
                this.action = this.DOLLY;
                break;
            case 3:
                this.action = this.TRANSLATE;
                break;
            default:
                this.action = this.NO_MOUSE_ACTION;
        }

        var touchPositions = [];
        for (var i=0; i<ev.touches.length; i++) {
                touchPositions[i] = {x: ev.touches[i].pageX, y: ev.touches[i].pageY};
        }
        this.prevTouchPositions = touchPositions;
    };

    XML3D.StandardCamera.prototype.touchEndEvent = function(event) {
        var ev = event || window.event;

        switch (ev.touches.length) {
            case 1:
                this.prevZoomVectorLength = null;
                if(this.mode == "examine")
                    this.action = this.ROTATE;
                else
                    this.action = this.LOOKAROUND;
                break;
            case 2:
                this.action = this.DOLLY;
                break;
            case 3:
                this.action = this.TRANSLATE;
                break;
            default:
                this.action = this.NO_MOUSE_ACTION;
        }

        var touchPositions = [];
        for (var i=0; i<ev.touches.length; i++) {
                touchPositions[i] = {x: ev.touches[i].pageX, y: ev.touches[i].pageY};
        }
        this.prevTouchPositions = touchPositions;
    };

    XML3D.StandardCamera.prototype.touchMoveEvent = function(event) {
        var ev = event || window.event;

        if (!this.action)
            return;

        event.preventDefault(); // Prevent a mouse event from also being dispatched

        var f, dx, dy, dv, trans, mx, my;
        switch(this.action) {
            case(this.TRANSLATE):
                if (this.touchTranslateMode == "threefinger") {
                    f = 2.0* Math.tan(this.transformInterface.fieldOfView/2.0) / this.height;
                    dx = f*(ev.touches[0].pageX - this.prevTouchPositions[0].x);
                    dy = f*(ev.touches[0].pageY - this.prevTouchPositions[0].y);
                    trans = new XML3D.Vec3(-dx*this.zoomSpeed, dy*this.zoomSpeed, 0.0);
                    trans = this.transformInterface.inverseTransformOf(trans);
                    this.transformInterface.translate(trans);
                    this.examinePoint = this.examinePoint.add(trans);
                }
                break;
            case(this.DOLLY):
                if (this.touchTranslateMode == "twofinger") {
                    //apple-style 2-finger dolly + translate
                    var prevMidpoint;

                    if (this.prevTouchPositions.length > 1) {
                        prevMidpoint = {x:(this.prevTouchPositions[0].x + this.prevTouchPositions[1].x) / 2 ,
                                        y:(this.prevTouchPositions[0].y + this.prevTouchPositions[1].y) / 2 }
                    }

                    if (prevMidpoint !== undefined) {
                        var curMidpoint = {x:(ev.touches[0].pageX + ev.touches[1].pageX) / 2 ,
                                           y:(ev.touches[0].pageY + ev.touches[1].pageY) / 2 };
                        f = 2.0* Math.tan(this.transformInterface.fieldOfView/2.0) / this.height;
                        dx = f*(curMidpoint.x - prevMidpoint.x);
                        dy = f*(curMidpoint.y - prevMidpoint.y);
                        trans = new XML3D.Vec3(-dx*this.zoomSpeed, dy*this.zoomSpeed, 0.0);
                        this.transformInterface.translate(this.transformInterface.inverseTransformOf(trans));
                    }
                }

                if (this.prevZoomVectorLength !== null) {
                    dv = {x: ev.touches[0].pageX - ev.touches[1].pageX, y: ev.touches[0].pageY - ev.touches[1].pageY};
                    var currLength = Math.sqrt(dv.x*dv.x + dv.y*dv.y);

                    dy = this.zoomSpeed * (currLength - this.prevZoomVectorLength) / this.height;
                    this.transformInterface.translate(this.transformInterface.inverseTransformOf(new XML3D.Vec3(0, 0, -dy)));

                    this.prevZoomVectorLength = currLength;
                } else {
                    dv = {x: ev.touches[0].pageX - ev.touches[1].pageX, y: ev.touches[0].pageY - ev.touches[1].pageY};
                    this.prevZoomVectorLength = Math.sqrt(dv.x*dv.x + dv.y*dv.y);
                }

                break;
            case(this.ROTATE):
                dx = -this.rotateSpeed*0.1 * (ev.touches[0].pageX - this.prevTouchPositions[0].x) * 2.0 * Math.PI / this.width;
                dy = -this.rotateSpeed*0.1 * (ev.touches[0].pageY - this.prevTouchPositions[0].y) * 2.0 * Math.PI / this.height;

                mx = XML3D.Quat.fromAxisAngle([0,1,0], dx);
                my = XML3D.Quat.fromAxisAngle([1,0,0], dy);
                mx = mx.mul(my);
                this.transformInterface.rotateAroundPoint(mx, this.examinePoint);
                break;
            case(this.LOOKAROUND):
                dx = -this.rotateSpeed*0.1 * (ev.touches[0].pageX - this.prevTouchPositions[0].x) * 2.0 * Math.PI / this.width;
                dy = this.rotateSpeed*0.1 * (ev.touches[0].pageY - this.prevTouchPositions[0].y) * 2.0 * Math.PI / this.height;
                var cross = this.upVector.cross(this.transformInterface.direction);

                mx = XML3D.Quat.fromAxisAngle( this.upVector , dx);
                my = XML3D.Quat.fromAxisAngle( cross , dy);

                this.transformInterface.lookAround(mx, my, this.upVector);
                break;
        }

        if (this.action != this.NO_MOUSE_ACTION) {
            var touchPositions = [];
            for (var i=0; i<ev.touches.length; i++) {
                touchPositions[i] = {x: ev.touches[i].pageX, y: ev.touches[i].pageY};
            }
            this.prevTouchPositions = touchPositions;
        }
    };


    // -----------------------------------------------------
    // key movement
    // -----------------------------------------------------

    XML3D.StandardCamera.prototype.keyHandling = function(e, action) {
        var KeyID = e.keyCode;
        switch (KeyID) {
            case 38: //up
            case 87: //w
            case 39: //right
            case 68: //d
            case 37: //left
            case 65: //a
            case 40: //down
            case 83: //s
                break;
            default:
                return; //Not a key we're interested in
        }

        if (action === "up") {
            delete this.activeKeys[KeyID];
            return;
        } else if (this.activeKeys[KeyID] !== undefined) {
            //Already animating this direction
            return;
        }

        //This is a new key press so we need to start a camera animation interval for it
        this.activeKeys[KeyID] = Date.now();
        window.requestAnimationFrame(this.moveTick.bind(this, KeyID));
    };

    XML3D.StandardCamera.prototype.moveTick = function(keyID) {
        if (this.activeKeys[keyID] === undefined) {
            //This key was released, returning without requesting a new animation frame will stop movement in this direction
            return;
        }

        var elementDir = this.transformInterface.direction;
        var np = this.transformInterface.position;

        switch (keyID) {
            case 38: // up
            case 87: // w
                break;
            case 39: // right
            case 68: // d
                elementDir = elementDir.cross(new XML3D.Vec3(0, 1, 0));
                break;
            case 37: // left
            case 65: // a
                elementDir = elementDir.cross(new XML3D.Vec3(0, -1, 0));
                break;
            case 40: // down
            case 83: // s
                elementDir = elementDir.negate();
                break;
            default:
                return;
        }
        var timeScale = (Date.now() - this.activeKeys[keyID]) / 16.67; //try to keep the same movement speed over time regardless of framerate
        np = np.add(elementDir.scale(this.zoomSpeed * 0.02 * timeScale));
        this.transformInterface.position = np;

        this.activeKeys[keyID] = Date.now();
        window.requestAnimationFrame(this.moveTick.bind(this, keyID));
    };


    var TransformInterface = function(element, xml3d) {
        this.element = element;
        this.xml3d = xml3d;
        this.transform = this.getTransformForElement(element);
    };

    TransformInterface.prototype.getTransformForElement = function(element) {
        if (element.hasAttribute("transform")) {
            //If the element already has a transform we can reuse that
            return document.querySelector(element.getAttribute("transform"));
        }
        return this.createTransformForView(element);
    };

    var elementCount = 0;
    TransformInterface.prototype.createTransformForView = function(element) {
        var transform = document.createElement("transform");
        var tid = "Generated_Camera_Transform_" + elementCount++;
        transform.setAttribute("id", tid);
        element.parentElement.appendChild(transform);
        element.setAttribute("transform", "#"+tid);
        return transform;
    };

    Object.defineProperty(TransformInterface.prototype, "orientation", {
        get: function() {
            return XML3D.Quat.fromAxisAngle(this.transform.rotation);
        },

        set: function(orientation) {
            var aa = XML3D.AxisAngle.fromQuat(orientation);
            this.transform.setAttribute("rotation", aa.toDOMString());
        }
    });

    Object.defineProperty(TransformInterface.prototype, "position", {
        get: function() {
            return this.transform.translation;
        },

        set: function(position) {
            this.transform.setAttribute("translation", position.toDOMString());
        }
    });

    Object.defineProperty(TransformInterface.prototype, "direction", {
        get: function() {
            var dir = new XML3D.Vec3(0, 0, -1);
            return dir.mul(this.orientation);
        },

        set: function(dir) {
            throw("Direction cannot be set directly.");
        }
    });

    Object.defineProperty(TransformInterface.prototype, "upVector", {
        get: function() {
            var up = new XML3D.Vec3(0, 1, 0);
            return up.mul(this.orientation);
        },

        set: function(up) {
            throw("Up vector cannot be set directly");
        }
    });

    /**
     *  This is always the VERTICAL field of view in radians
     */
    Object.defineProperty(TransformInterface.prototype, "fieldOfView", {
        get: function() {
            var fovh = this.element.querySelector("float[name=fovHorizontal]");
            if (fovh) {
                var h = fovh.value[0];
                return 2 * Math.atan(Math.tan(h / 2.0) * this.xml3d.width / this.xml3d.height);
            }
            var fovv = this.element.querySelector("float[name=fovVertical]");
            if (fovv) {
                return fovv.value[0];
            }
            return (45 * Math.PI / 180); //Default FOV
        },

        set: function(fov) {
            var fovh = this.element.querySelector("float[name=fovHorizontal]");
            if (fovh) {
                fovh.parentNode.removeChild(fovh);
            }
            var fovv = this.element.querySelector("float[name=fovVertical]");
            if (!fovv) {
                fovv = document.createElement("float");
                fovv.setAttribute("name", "fovVertical");
                this.element.appendChild(fovv);
            }
            fovv.textContent = fov;
        }
    });

    TransformInterface.prototype.rotateAroundPoint = function(q0, p0) {
        this.orientation = this.orientation.mul(q0).normalize();
        var aa = XML3D.AxisAngle.fromQuat(q0);
        var axis = this.inverseTransformOf(aa.axis);
        var tmpQuat = XML3D.Quat.fromAxisAngle(axis, aa.angle);
        this.position = this.position.subtract(p0).mul(tmpQuat).add(p0);
    };

    TransformInterface.prototype.lookAround = function(rotSide, rotUp, upVector) {
        var check = rotUp.mul(this.orientation);

        var tmp = new XML3D.Vec3(0,0,-1).mul(check);
        var rot = rotSide.clone();
        if (Math.abs(upVector.dot(tmp)) <= 0.95) {
            rot = rot.mul(rotUp);
        }

        rot = rot.normalize().mul(this.orientation).normalize();
        this.orientation = rot;
    };

    TransformInterface.prototype.rotate = function(q0) {
        this.orientation = this.orientation.mul(q0).normalize();
    };

    TransformInterface.prototype.translate = function(t0) {
        this.position = this.position.add(t0);
    };

    TransformInterface.prototype.inverseTransformOf = function(vec) {
        return vec.mul(this.orientation);
    };

    TransformInterface.prototype.lookAt = function(point) {
        var dir = point.sub(this.position).normalize();
        var up = new XML3D.Vec3(0,1,0);
        var orientation = this.orientation;
        var basisX = new XML3D.Vec3(dir).cross(up);
        if (!basisX.length()) {
            basisX = new XML3D.Vec3(1,0,0).mul(orientation);
        }
        var basisY = basisX.clone().cross(dir);
        var basisZ = new XML3D.Vec3(dir).negate();
        this.orientation = XML3D.Quat.fromBasis(basisX, basisY, basisZ);
    };
})();

// Automatically creates a camera instance using the first view element on the page
window.addEventListener("load", function() {
    var xml3d = document.querySelector("xml3d");
    var init = function() {
        var view;
        if (xml3d.hasAttribute("view")) {
            view = document.querySelector(xml3d.getAttribute("view"));
        } else {
            view = document.querySelector("view");
        }
        if (view && XML3D.StandardCamera.Instance !== false)
            XML3D.StandardCamera.Instance = new XML3D.StandardCamera(view, {mode: "fly", useKeys: true});
    };
    if (xml3d) {
        if (xml3d.complete)
            init();
        else
            xml3d.addEventListener("load", init);
    }
});
