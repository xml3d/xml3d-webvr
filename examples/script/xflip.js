var Xflip = {};

(function() {

    var scripts = document.getElementsByTagName("script"),
        CURRENT_SCRIPT_PATH = scripts[scripts.length-1].src;

    var c_worker = null;
    var c_nodes = [];
    var c_initialized = false;
    var c_domLoaded = false;
    var c_observer = null;
    var c_modified = {};
    var c_done_callbacks = [];


    /** Load Xflow module to extend functionality
     * @param addOns Array of urls for modules to load
     **/
    Xflip.init = function(addOns){
        var workerURL = CURRENT_SCRIPT_PATH.replace(/[^/]*$/,'xflip-worker.js');

        c_worker = new Worker(workerURL);
        c_worker.onmessage = onMessage;
        c_worker.postMessage({
            'type' : 'initialize',
            'root' : document.URL,
            'addons' : addOns
        });
    }

    Xflip.addCallback = function(callback){
        c_done_callbacks.push(callback);
    }

    Xflip.removeCallback = function(callback){
        var idx = c_done_callbacks.indexOf(callback);
        c_done_callbacks.splice(idx,1);
    }

    function onDomLoaded(){
        c_domLoaded = true;
        addStyleTag();
        if(c_initialized){
            parseDocument();
        }
    }

    function addStyleTag(){
        var style = document.createElement("style");
        style.setAttribute("type", "text/css");
        style.innerHTML = "xflowip { display: none;}\n" +
                "xflowimg { display: inline-block; position: relative;}\n" +
                "xflowimg * { display: none;}\n" +
                "xflowimg canvas { display: inline-block }" +
                "xflowimg .xflowipInfo { display: block; position: absolute; bottom: 0; left: 0; right: 0; background: black; color: white; font-size: 10pt}";
        document.head.appendChild(style);
    }

    function onMessage(event){
        var data = event.data;
        var type = data['type'];
        switch(type){
            case 'initialized':
                c_initialized = true;
                if(c_domLoaded){
                    parseDocument();
                }
                break;
            case 'loadImage':
                var url = data['url'];
                var id = data['id'];
                var img = new Image();
                img.onload = function(){
                    var data = createImageData(img);
                    c_worker.postMessage({ 'type' : 'imageLoaded' ,
                        'id' : id, 'imageData': data });
                }
                img.src = url;
                break;
            case 'updateSinkImage':
                updateSinkImage(data['id'], data['imageData']);
                endLoading(data['id']);
                break;
            case 'modified':
                startLoading(data['id']);
                break;
            case 'log':
                Xflip.log("Worker: " + event.data['msg']);
                break;
            case 'warning':
                Xflip.warning("Worker: " + event.data['msg']);
                break;
            case 'error':
                Xflip.error("Worker: " + event.data['msg']);
                break;
            default: Xflip.error("Unknown Message Type: '" + type + "'");
        }
    }

    function onDomChange(records){
        for(var i = 0; i < records.length; ++i){
            var record = records[i];
            var node = record.target;
            if(node.nodeType == 3) node = node.parentNode;

            switch(record.type){
                case "attributes" :
                    c_worker.postMessage({
                        'type' : 'updateAttribute',
                        'id' : node._xflowip.id,
                        'attrName' : record.attributeName,
                        'attrValue' : node.getAttribute(record.attributeName)
                    });
                    break;
                case "characterData" :
                    c_worker.postMessage({
                        'type' : 'updateValue',
                        'id' : node._xflowip.id,
                        'value' : getNodeValue(node)
                    })
                    break;
                case "childList" :
                    break;
                default: Xflip.error("Unknown Mutation Type: '" + record.type + "'");
            }
        }
    }

    var MutationObserver = (window.MutationObserver || window.WebKitMutationObserver ||
        window.MozMutationObserver);

    c_observer = new MutationObserver(onDomChange);


    function parseDocument(){
        Xflip.log("Start Parsing!");
        var xflowips = document.querySelectorAll("xflowip");
        for(var i = 0; i < xflowips.length; ++i){
            initNode(xflowips[i]);
        }

        var xflowimg = document.querySelectorAll("xflowimg");
        for(var i = 0; i < xflowimg.length; ++i){
            initSinkNode(xflowimg[i]);
        }
        Xflip.log("End Parsing!");
    }


    function initNode(node){
        var configData = node._xflowip = {};
        configData.id = c_nodes.length;
        c_nodes.push(node);

        var nodeData = getNodeData(node);
        c_worker.postMessage({ 'type' : 'createNode' , 'nodeData' : nodeData });

        c_observer.observe(node, {attributes: true,childList: true});
        var k = node.firstChild;
        while(k){
            if(k.nodeType == 3)
                c_observer.observe(k, {characterData: true});
            k = k.nextSibling;
        }
        initNodeChildren(node);
    }

    function initSinkNode(node){
        initNode(node);
        var canvas = document.createElement("canvas");
        var info = document.createElement("div");
        info.className = "xflowipInfo";
        node.appendChild(canvas);
        node.appendChild(info);
        syncCanvasStyle(node, canvas);
        node._xflowip.canvas = canvas;
        node._xflowip.info = info;

        node.finished = function(){
            return !c_modified[this._xflowip.id];
        }
        node.getCanvas = function(){
            return this._xflowip.canvas;
        }

    }

    function syncCanvasStyle(node, canvas){


        // We need to hide the node, because otherwise computed Style width and height won't return 'auto' but only precise pixel values
        var prevDisplay = node.style.display;
        node.style.display = 'none';
        var cStyle = window.getComputedStyle(node);
        var originalStyle = window.getComputedStyle(canvas);
        /*
        for(var i in cStyle){
            if(isNaN(i) && i != "cssText"){
                var newValue = cStyle[i] && cStyle[i].replace && cStyle[i].replace("0px", "0");
                var oldValue = originalStyle[i] && originalStyle[i].replace && originalStyle[i].replace("0px", "0");
                if(newValue != oldValue)
                    canvas.style[i] = cStyle[i];
            }
        }
        */
        canvas.style.width = cStyle.width;
        canvas.style.height = cStyle.height;
        node.style.display = prevDisplay;


    }

    function getNodeData(node){
        var nodeData = {
            "id" : node._xflowip.id,
            "tagName" : node.tagName.toLowerCase(),
            "attribs" : {},
            "value" : {}
        }
        for (var i=0, attrs=node.attributes, l=attrs.length; i<l; i++){
            nodeData["attribs"][attrs.item(i).nodeName] = attrs.item(i).nodeValue;
        }

        nodeData["value"] = getNodeValue(node);
        return nodeData;
    }

    function getNodeValue(node){
        var value = "";
        var k = node.firstChild;
        while (k) {
            value += k.nodeType == 3 ? k.textContent : " ";
            k = k.nextSibling;
        }
        return value;
    }

    function initNodeChildren(node){
        var k = node.firstChild;
        while (k) {
            if(k.nodeType != 3){
                initNode(k);
                if(k._xflowip){
                    c_worker.postMessage({ 'type' : 'connectNodes' ,
                        'parent' : node._xflowip.id,
                        'child' : k._xflowip.id });
                }
            }
            k = k.nextSibling;
        }
    }

    function startLoading(nodeId){
        var node = c_nodes[nodeId];
        c_modified[nodeId] = true;
        if(!node || !node._xflowip.info) return;
        if(node._xflowip.interval) return;
        var point = 0;
        node._xflowip.interval = window.setInterval(function(){
            point = (point + 1) % 4;
            var text = "loading";
            for(var i=1; i < point; ++i) text += ".";
            node._xflowip.info.innerHTML = text;
        }, 200);
    }

    function endLoading(nodeId){
        var node = c_nodes[nodeId];
        if(!node || !node._xflowip.info) return;
        window.clearInterval(node._xflowip.interval);
        node._xflowip.interval = null;
        node._xflowip.info.innerHTML = "";

        delete c_modified[nodeId];
        notifyFinished();
    }


    function notifyFinished(){
        var n;
        for(var n in c_modified);
        if(!n){
            for(var i= 0; i < c_done_callbacks.length; ++i){
                c_done_callbacks[i]();
            }
        }
    }

    var c_canvas = document.createElement("canvas");
    function createImageData(img){
        c_canvas.width = img.width;
        c_canvas.height = img.height;
        var ctx = c_canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, img.width, img.height);
    }
    function getNativeImageData(imageData){
        if(imageData instanceof ImageData)
            return imageData;

        c_canvas.width = imageData.width;
        c_canvas.height = imageData.height;
        var ctx = c_canvas.getContext("2d");
        var result = ctx.getImageData(0, 0, imageData.width, imageData.height);
        result.data.set(imageData.data);
        return result;
    }

    function updateSinkImage(id, imageData){
        var node = c_nodes[id];
        var canvas = node._xflowip.canvas;
        var ctx = canvas.getContext("2d");
        if(!imageData){
            canvas.width = 64;
            canvas.height = 64;
            ctx.fillStyle = "black";
            ctx.fillRect(0,0, 64, 64);
        }
        else{
            imageData = getNativeImageData(imageData);
            canvas.width = imageData.width;
            canvas.height = imageData.height;
            ctx.putImageData(imageData, 0, 0);
        }
        syncCanvasStyle(node, canvas);
    }

    window.addEventListener('DOMContentLoaded', onDomLoaded, false);

    // Utils:
    Xflip.error = function(msg){
        if(window.console){
            window.console.error(msg);
        }
    }

    Xflip.warning = function(msg){
        if(window.console){
            window.console.warning(msg);
        }
    }

    Xflip.log = function(msg){
        if(window.console){
            window.console.log(msg);
        }
    }

})();