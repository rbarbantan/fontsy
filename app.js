'use strict';

var API_URL = 'https://vision.googleapis.com/v1/images:annotate?key=' + window.apiKey;

navigator.getUserMedia = ( navigator.getUserMedia ||
                       navigator.webkitGetUserMedia ||
                       navigator.mozGetUserMedia ||
                       navigator.msGetUserMedia);
var videoWidth, videoHeight;

function rgbToHex(r, g, b) {
    if (r > 255 || g > 255 || b > 255)
        throw "Invalid color component";
    return ((r << 16) | (g << 8) | b).toString(16);
}

function hasGetUserMedia() {
  return !!(navigator.getUserMedia || navigator.webkitGetUserMedia ||
            navigator.mozGetUserMedia || navigator.msGetUserMedia);
}

function errorCallback(err ) {
    console.log(err);
}

function saveSnapshot(canvas) {
   var context = canvas.getContext("2d");
   var snapshot = context.getImageData(0, 0,
                             canvas.width,
                             canvas.height);
   return snapshot;
}

function loadSnapshot(context, snapshot) {
   context.putImageData(snapshot, 0, 0);
}

/** draws the recognized text over the original image captured from camera **/
function drawText(c2, snapshot, response) {
  loadSnapshot(c2, snapshot)

  // delete original text at symbol level for best color matching
  var fullAnno = response['fullTextAnnotation'];
  if (fullAnno && fullAnno.pages) {
    for(var page in fullAnno.pages) {
      for(var block in fullAnno.pages[page].blocks) {
        for(var paragraph in fullAnno.pages[page].blocks[block].paragraphs) {
          for(var word in fullAnno.pages[page].blocks[block].paragraphs[paragraph].words) {
            for (var symbol in fullAnno.pages[page].blocks[block].paragraphs[paragraph].words[word].symbols) {
              var rect = fullAnno.pages[page].blocks[block].paragraphs[paragraph].words[word].symbols[symbol].boundingBox;
              var p = c2.getImageData(rect.vertices[0].x, rect.vertices[0].y, 1, 1).data;
              var hex = "#" + ("000000" + rgbToHex(p[0], p[1], p[2])).slice(-6);

              c2.fillStyle = hex;
              c2.beginPath();
              var pad = 5;
              c2.moveTo(rect.vertices[0].x-pad, rect.vertices[0].y-pad);
              c2.lineTo(rect.vertices[1].x+pad, rect.vertices[1].y-pad);
              c2.lineTo(rect.vertices[2].x+pad, rect.vertices[2].y+pad);
              c2.lineTo(rect.vertices[3].x-pad, rect.vertices[3].y+pad);
              c2.closePath();
              c2.fill();

            }
          }
        }
      }
    }
  }

  // add new text at word level to keep same size for letters
  var font = $("select#font option:selected").text();
  var simpleAnno = response['textAnnotations'];
  if (simpleAnno && simpleAnno.length) {
    for(var i=1; i < simpleAnno.length; i++) {
      var rect = simpleAnno[i].boundingPoly;
      var text = simpleAnno[i].description;
      var textH = Math.sqrt((rect.vertices[3].x-rect.vertices[0].x) * (rect.vertices[3].x-rect.vertices[0].x) +
          (rect.vertices[3].y-rect.vertices[0].y)*(rect.vertices[3].y-rect.vertices[0].y));
      var textW = Math.sqrt((rect.vertices[3].x-rect.vertices[2].x) * (rect.vertices[3].x-rect.vertices[2].x) +
          (rect.vertices[3].y-rect.vertices[2].y)*(rect.vertices[3].y-rect.vertices[2].y));
      var angle = Math.atan2((rect.vertices[1].y-rect.vertices[0].y),(rect.vertices[1].x-rect.vertices[0].x));// * 180 / Math.PI;

      var fontsize = 200;
      do {
        fontsize--;
        c2.font = fontsize + 'px ' + font;
      } while (c2.measureText(text).width > textW)

      c2.save();
      c2.translate(rect.vertices[0].x, rect.vertices[0].y);
      c2.rotate(angle);
      c2.fillStyle = $('select#color option:selected').val();
      c2.font = fontsize + 'px ' + font;
      c2.fillText(text, 0, textH);
      c2.restore();
    }
  }
}

/* open video stream from specified device id */
function getVideo(cameraId) {
  navigator.getUserMedia({video:{ deviceId: cameraId }, audio:false}, function(localMediaStream) {
      var video = document.querySelector('video');
      video.src = window.URL.createObjectURL(localMediaStream);

      // Note: onloadedmetadata doesn't fire in Chrome when using it with getUserMedia.
      // See crbug.com/110938.
      video.onloadedmetadata = function(e) {
        // Ready to go. Do some stuff.
        videoWidth = this.videoWidth;
        videoHeight = this.videoHeight;
        $('canvas').width(videoWidth).height(videoHeight)
        $('#snap').show();
      };
    }, errorCallback);
}

// Put event listeners into place
window.addEventListener("DOMContentLoaded", function() {

    $("#buttons").hide();

    var canvas = document.getElementById('canvas')
    canvas.width = 640;
    canvas.height = 480;

    var context = canvas.getContext("2d")

    if (hasGetUserMedia()) {
      navigator.mediaDevices.enumerateDevices()
        .then(function(devices) {

          var videoDevices = devices.filter(function (device){
            return device.kind === 'videoinput'
          });
          var currentDeviceId = videoDevices[0].deviceId
          getVideo(currentDeviceId);

          // if there are two cameras (front and back) allow switching between them
          if (videoDevices.length == 2) {
            $('#switch').show();
            $('#switch').click(function() {
              if (videoDevices[0].deviceId === currentDeviceId) {
                currentDeviceId = videoDevices[1].deviceId;
              } else {
                currentDeviceId = videoDevices[0].deviceId;
              }
              getVideo(currentDeviceId);
            });
          }
        })
        .catch(function(err) {
          console.log(err.name + ": " + err.message);
        });

    } else {
      // I'm looking at you, Apple!
      alert('getUserMedia() is not supported in your browser');
    }


    // Get-Save Snapshot - image
    document.getElementById("snap").addEventListener("click", function() {
        context.drawImage(video, 0, 0, 640, 480);
        var snapshot = saveSnapshot(canvas);
        //$("#video").hide();
        //$("#canvas").show();
        //$("#snap").hide();
        //$("#reset").show();
        //$("#upload").show();

        var dataUrl = canvas.toDataURL();
        //$("#uploading").show();
        var request = {
            requests: [{
              image: {
                content: dataUrl.replace("data:image/png;base64,", "")
              },
              features: [{
                type: 'TEXT_DETECTION',
                maxResults: 1
              }]
            }]
          };
        $.ajax({
          type: "POST",
          url: API_URL,
          data: JSON.stringify(request),
          contentType: 'application/json'
        }).fail(function (jqXHR, textStatus, errorThrown) {
          console.log('ERRORS: ' + textStatus + ' ' + errorThrown);
        }).done(function(msg) {

          var response = msg.responses[0];
          var c2 = canvas.getContext("2d");
          drawText(c2, snapshot, response);

          $("#video").hide();
          $("#canvas").show();
          $("#buttons").show();
          $("#intro").hide();
          $("#snap").hide();
          $('#switch').hide();
          $("#save").click(function() {
            var dt = canvas.toDataURL('image/png');
            this.href = dt.replace(/^data:image\/[^;]/, 'data:application/octet-stream');
          });
          $("#font, #color").change(function(){
            //console.log($("select option:selected").text());
            drawText(c2, snapshot, response);
          });
        });
    });

    $("#redo").click(function() {
      $("#video").show();
      $("#canvas").hide();
      $("intro").show();
      $("#snap").show();
      $("#switch").show();
      $("#buttons").hide();

    });

    // reset - clear - to Capture New Photo
    /*document.getElementById("reset").addEventListener("click", function() {
        $("#video").show();
        $("#canvas").hide();
        $("#snap").show();
        $("#reset").hide();
        //$("#upload").hide();
    });*/

}, false);
