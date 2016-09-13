var render = module.exports = {};

var fov = require("./fov.js");

// Scales values dat WebVR gives in metres
var scale = 10.0;
var translationScale = 3.0;

//******************************************** Custom RenderTree

render.vrRenderTree = function(){
    console.log("creating custom render tree");

    var leftEye = HMD.getEyeParameters("left");
    var rightEye = HMD.getEyeParameters("right");
    var leftOffset = leftEye.offset;
    var rightOffset = rightEye.offset;
    
    // cache jQuery lookups
    var $eyeTransform = $("#eyeTransform");
    var $headTransformGroup = $("#headTransformGroup");
    
    // Prepare the headTransformGroup for use
    $headTransformGroup.before('<transform id="headTransform"></transform>');
    $headTransformGroup.attr("transform", "#headTransform")
    
    var $headTransform = $("#headTransform");

    // Define the translations for the left/right eye
    $eyeTransform.before('<transform id="leftEyeTransform" translation="' + leftOffset[0] * scale + ' ' + leftOffset[1] * scale + ' ' + leftOffset[2] * scale + '"></transform>');
    $eyeTransform.before('<transform id="rightEyeTransform" translation="' + rightOffset[0] * scale + ' ' + rightOffset[1] * scale + ' ' + rightOffset[2] * scale + '"></transform>');
    $eyeTransform.before('<transform id="defaultEyeTransform" translation="0 0 0"></transform>');

    //TODO: (Christian) jquery does some weird stuff in wrap(), try doing this manually (add group to DOM, remove view, add view under group)
    // Create a group around view to apply the eye transformation to
    // Dynamically creating this does not work with XML3D??
    //$("view").wrap('<group id="eyeTransform" transform="#defaultEyeTransform">');
    //$("#eyeTransform").append($("#Generated_Camera_Transform_0"));

    // TODO: Maybe change to leftEye + rightEye?
    var width = Math.max(leftEye.renderWidth, rightEye.renderWidth) * 2;
    var height = Math.max(leftEye.renderHeight, rightEye.renderHeight);

    console.log("x: " + width + ", y: " + height);


    // Register the VR shader
    XML3D.materials.register("vr-shader", {
        vertex: [
            "attribute vec3 position;",

            "void main(void) {",
            "   gl_Position = vec4(position, 1.0);",
            "}"
        ].join("\n"),


        fragment: [
            "uniform sampler2D leftTexture;",
            "uniform sampler2D rightTexture;",
            "uniform vec2 canvasSize;",

            "void main(void) {",
            "   float texX = (gl_FragCoord.x / canvasSize.x);",
            "   vec2 texcoord;",
            "   vec4 sum = vec4(0.0);",

            "   if (texX < 0.5) {",
            "   texcoord = (gl_FragCoord.xy / canvasSize.xy);",
            "   sum += texture2D(leftTexture, vec2(texcoord.x * 2.0, texcoord.y));",
            "   }",

            "   else{",
            "   texcoord.x = (texX - 0.5);",
            "   texcoord.y = (gl_FragCoord.y / canvasSize.y);",
            "   sum += texture2D(rightTexture, vec2(texcoord.x * 2.0, texcoord.y));",
            "   }",

            "    gl_FragColor = sum;",
            "}"
        ].join("\n"),

        uniforms: {
            //Dont change here, but at uniformVariables
            canvasSize: [width, height],
        },

        samplers: {
            leftTexture: null,
            rightTexture: null
        }
    });

    // Define the VR RenderPass
    var VRPass = function (renderInterface, output, opt) {
        XML3D.webgl.BaseRenderPass.call(this, renderInterface, output, opt);

        // The left and right passes will be combined onto this fullscreen quad
        this.fullscreenQuad = renderInterface.createFullscreenQuad();

        this.shaderProgram = renderInterface.getShaderProgram(opt.shader);

    };
    XML3D.createClass(VRPass, XML3D.webgl.BaseRenderPass);
    XML3D.extend(VRPass.prototype, {
        render: function (scene) {
            var gl = this.renderInterface.context.gl;
            this.output.bind();
            this.shaderProgram.bind();

            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.disable(gl.DEPTH_TEST);

            // Uniform variables used by the shader 
            var uniformVariables = {};
            //uniformVariables.canvasSize = [this.output.width, this.output.height];
            //TODO: test
            uniformVariables.canvasSize = [width, height];
            
            // Left and right buffers will be rendered onto these
            uniformVariables.leftTexture = [this.inputs.leftTexture.colorTarget.handle];
            uniformVariables.rightTexture = [this.inputs.rightTexture.colorTarget.handle];
            this.shaderProgram.setSystemUniformVariables(Object.keys(uniformVariables), uniformVariables);

            // TODO: old comment/code
            // Draw the full screen quad using the given shader program
            this.fullscreenQuad.draw(this.shaderProgram);

            // TODO: old comment
            // It's good practice to undo any changes you've made to the GL state after rendering
            // failure to do so can have unintended side effects in subsequent render passes!
            this.shaderProgram.unbind();
            this.output.unbind();
            gl.enable(gl.DEPTH_TEST);
        },

        setProcessed: function (processed) {
            this.processed = processed;
            this.prePasses[0].processed = processed;
            this.prePasses[1].processed = processed;
        },

        // Custom VR-rendertree, swapping cameras in between rendering the prepasses
        renderTree: function (scene) {
            if (this.processed)
                return;
            this.processed = true;

            // Stereo view

            // Get pose as late as possible to minimize latency!
            var pose = HMD.getPose();

            // Rotation of the head:
            // Get the orientation (given as quaternion)
            var orientationQ = pose.orientation ? pose.orientation : [0, 0, 0, 1];
            // Transform into axis + angle
            var orientationAA = new XML3D.AxisAngle.fromQuat(new XML3D.Quat(orientationQ[0], orientationQ[1], orientationQ[2], orientationQ[3]));
            // Update rotation attribute
            var oriString = orientationAA.axis.x + ' ' + orientationAA.axis.y + ' ' + orientationAA.axis.z + ' ' + orientationAA.angle;
            // Apply rotation transformation to head
            //TODO: (Christian) cache this jquery element lookup and any others that happen inside the render loop, can be very costly
            $headTransform.attr("rotation", oriString);

            // Movement of the head:
            // Get position as 3D vector
            var position = pose.position ? pose.position : [0, 0, 0];
            // Convert to string
            var posiString = position[0] * scale * translationScale + ' ' + position[1] * scale * translationScale + ' ' + position[2] * scale * translationScale;
            // Apply position transformation to head
            $headTransform.attr("translation", posiString);
            
            fov.setFOV();
            
            var i = this.prePasses.length;
            if (i == 2) {
                var rightPass = this.prePasses[0];
                var leftPass = this.prePasses[1];

                $eyeTransform.attr("transform", "#leftEyeTransform");
                XML3D.flushDOMChanges();
                leftPass.renderTree(scene);
                //leftPass.render(scene);
                $eyeTransform.attr("transform", "#rightEyeTransform");
                XML3D.flushDOMChanges();
                rightPass.renderTree(scene);
                //rightPass.render(scene);

            } else {
                // If something unexpected happens
                while (i--)
                    this.prePasses[i].renderTree(scene);
            }
            this.render(scene);
            
            HMD.submitFrame(pose);
        },
    });


    // Define the VR-RenderTree
    var vrTree = function (renderInterface) {
        XML3D.webgl.BaseRenderTree.call(this, renderInterface);
        this.createRenderPasses();
    };
    
    XML3D.createClass(vrTree, XML3D.webgl.BaseRenderTree);
    XML3D.extend(vrTree.prototype, {
        //Define the custom renderpass for VR
        createRenderPasses: function () {
            var context = this.renderInterface.context;

            // Create the left and right Framebuffers, one for each eye
            var leftBuffer = this.renderInterface.createRenderTarget({
                width: leftEye.renderWidth,
                height: leftEye.renderHeight,
                colorFormat: context.gl.RGBA,
                depthFormat: context.gl.DEPTH_COMPONENT16,
                depthAsRenderbuffer: true,
                stencilFormat: null
            });
            var rightBuffer = this.renderInterface.createRenderTarget({
                width: rightEye.renderWidth,
                height: rightEye.renderHeight,
                colorFormat: context.gl.RGBA,
                depthFormat: context.gl.DEPTH_COMPONENT16,
                depthAsRenderbuffer: true,
                stencilFormat: null
            });

            // Instantiate the left and right pre-passes, each being a standard XML3D render pass
            // Both passes render to a respective buffer, which will be combined in the VR-pass
            // These can be replaced by standard passes, e.g. to apply postprocessing effects
            var leftPass = this.renderInterface.createSceneRenderPass(leftBuffer);
            var rightPass = this.renderInterface.createSceneRenderPass(rightBuffer);

            var opts = {
                inputs: {
                    'leftTexture': leftBuffer,
                    'rightTexture': rightBuffer
                },
                shader: "vr-shader",
                id: "vr"
            };

            // Create the VR-pass
            var vrPass_ = new VRPass(this.renderInterface, context.canvasTarget, opts);

            // Add the left and right pre-passes to the VR-pass
            vrPass_.addPrePass(rightPass);
            vrPass_.addPrePass(leftPass);


            // Set the main-pass to the custom VR-pass
            this.mainRenderPass = vrPass_;
        },

        // Standard render function
        render: function (scene) {
            this.mainRenderPass.setProcessed(false);
            XML3D.webgl.BaseRenderTree.prototype.render.call(this, scene);
        }
    });

    //Create the VR-rendertree and activate it, using the renderinterface
    //TODO: (Christian) find XML3D element by tag name instead of id
    var xml3dElement = document.getElementById("MyXml3d");
    var renderInterface = xml3dElement.getRenderInterface();
    var vrRenderTree = new vrTree(renderInterface);
    renderInterface.setRenderTree(vrRenderTree);

    //Christian: set XML3D to continuous rendering mode:
    XML3D.options.setValue("renderer-continuous", true);
};