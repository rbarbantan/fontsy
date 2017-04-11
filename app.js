'use strict';

var API_URL = 'https://vision.googleapis.com/v1/images:annotate?key=' + window.apiKey;

//var response;
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

              var textH = rect.vertices[2].y - rect.vertices[0].y;
              var textW = rect.vertices[1].x - rect.vertices[0].x;
              var angle = Math.atan2((rect.vertices[1].y-rect.vertices[0].y),(rect.vertices[1].x-rect.vertices[0].x));// * 180 / Math.PI;
              c2.save();
              c2.translate(rect.vertices[0].x + textW/2, rect.vertices[0].y+textH/2);
              c2.rotate(angle);

              c2.fillStyle = hex;
              c2.beginPath();

              c2.moveTo(-textW/2,-textH/2);
              c2.lineTo(textW/2, -textH/2);
              c2.lineTo(textW/2, textH/2);
              c2.lineTo(-textW/2, textH/2);
              c2.closePath();
              c2.fill();

              c2.restore();
            }
          }
        }
      }
    }
  }

  // add new text at word level to keep same size for letters
  var font = $("select#font option:selected").text();
  var simpleAnno = response['textAnnotations'];
  if(simpleAnno && simpleAnno.length) {
    for(var i=1; i < simpleAnno.length; i++) {
      var rect = simpleAnno[i].boundingPoly;
      var text = simpleAnno[i].description;
      var textH = rect.vertices[2].y - rect.vertices[0].y;
      var textW = rect.vertices[1].x - rect.vertices[0].x;
      var angle = Math.atan2((rect.vertices[1].y-rect.vertices[0].y),(rect.vertices[1].x-rect.vertices[0].x));// * 180 / Math.PI;

      var fontsize = 200;
      do {
        fontsize--;
        c2.font = fontsize + 'px ' + font;
      } while (c2.measureText(text).width > textW)
      //console.log(text +' '+ fontsize);

      c2.save();
      c2.translate(rect.vertices[0].x + textW/2, rect.vertices[0].y+textH/2);
      c2.rotate(angle);

      c2.fillStyle = $('select#color option:selected').val();//"#fff";
      c2.font = fontsize + 'px ' + font;
      c2.fillText(text, -textW/2, textH/2);

      c2.restore();
    }
  }
}

// Put event listeners into place
window.addEventListener("DOMContentLoaded", function() {
    console.log("content loaded");

    var videoWidth, videoHeight;
    $("#buttons").hide();


    var canvas = document.getElementById('canvas')
    canvas.width = 640;
    canvas.height = 480;

    var context = canvas.getContext("2d")

    if (hasGetUserMedia()) {
      var constraints = {
        video: {
          mandatory: {
            maxWidth: 640,
            maxHeight: 360
          }
        },
        audio: false
      };
      navigator.getUserMedia({video:true, audio:false}, function(localMediaStream) {
      //navigator.getUserMedia(constraints, function(localMediaStream) {
          var video = document.querySelector('video');
          video.src = window.URL.createObjectURL(localMediaStream);

          // Note: onloadedmetadata doesn't fire in Chrome when using it with getUserMedia.
          // See crbug.com/110938.
          video.onloadedmetadata = function(e) {
            // Ready to go. Do some stuff.
            console.log(e);
            videoWidth = this.videoWidth;
            videoHeight = this.videoHeight;
            $('#snap').show();
          };
        }, errorCallback);

    } else {
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
          console.log(msg);

          var response = msg.responses[0];
          var c2 = canvas.getContext("2d");
          drawText(c2, snapshot, response);

          $("#video").hide();
          $("#canvas").show();
          $("#buttons").show();
          $("#intro").hide();
          $("#snap").hide();
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
