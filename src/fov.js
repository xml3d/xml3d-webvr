var fov = module.exports = {};

// Sets the FOV in the view element
fov.setFOV = function(){
    var fov, zNear, zFar;
    zNear = 0.01;
    zFar = 100;

    //TODO: (Christian) This function should take the view element and xml3d element as arguments to avoid DOM lookups
    // and to make it more generic

    // Compute the clipping planes for zNear and zFar
    var viewMatrix = document.querySelector("view").getViewMatrix();    //View Matrix
    var bb = document.querySelector("xml3d").getWorldBoundingBox(); //BBox for the entire scene
    
    // Transform BBox to view space
    bb.transformAxisAligned(viewMatrix);
    
    zNear = -bb.max.z;
    zFar = -bb.min.z;

    // zNear should remain above 0.01 to avoid problems with camera
    zNear = (zNear < 0.01) ? 0.01 : zNear;
    
    // Assumes left and right FOV are equal
    // TODO: Not necessarily equal, possibly set FOV per left/right view?
    fov = HMD.getEyeParameters("right").fieldOfView;
    
    var projectionMatrix = fieldOfViewToProjectionMatrix(fov, zNear, zFar);

    //TODO: (Christian) replace the text content of the existing float4x4 element ( element.textContent = arrayToString(projectionMatrix) )
    var matrixString = "<float4x4 name='projectionMatrix'>" + arrayToString(projectionMatrix) + "</float4x4>";

    //TODO: (Christian) setup code (like changing the view model and creating the float4x4 element) should now be done outside this function
    //since it's now being called once per frame, huge performance hit if you do this stuff here. Best would be to change the view model and append
    //the float4x4 during the initial setup in the render tree instead of here.
    var $view = $("view");
    var $fovProjection = $("#fovProjection");
    
    $view.attr("model", "urn:xml3d:view:projective");
    $view.append(matrixString);

}

// Returns FOV Projection Matrix, as given by: https://w3c.github.io/webvr/#interface-interface-vrfieldofview
function fieldOfViewToProjectionMatrix (fov, zNear, zFar) {
  var upTan = Math.tan(fov.upDegrees * Math.PI / 180.0);
  var downTan = Math.tan(fov.downDegrees * Math.PI / 180.0);
  var leftTan = Math.tan(fov.leftDegrees * Math.PI / 180.0);
  var rightTan = Math.tan(fov.rightDegrees * Math.PI / 180.0);
    
  var xScale = 2.0 / (leftTan + rightTan);
  var yScale = 2.0 / (upTan + downTan);

  var out = new Float32Array(16);
  out[0] = xScale;
  out[1] = 0.0;
  out[2] = 0.0;
  out[3] = 0.0;
  out[4] = 0.0;
  out[5] = yScale;
  out[6] = 0.0;
  out[7] = 0.0;
  out[8] = -((leftTan - rightTan) * xScale * 0.5);
  out[9] = ((upTan - downTan) * yScale * 0.5);
  out[10] = -(zNear + zFar) / (zFar - zNear);
  out[11] = -1.0;
  out[12] = 0.0;
  out[13] = 0.0;
  out[14] = -(2.0 * zFar * zNear) / (zFar - zNear);
  out[15] = 0.0;

  return out;
}

// Returns array as a String with format: "[1] [2] [3] ..."
function arrayToString(array){
    var result = "";
    for (var i = 0; i < array.length; i++){
        result = result + " " + array[i];
    }
    return result;
}