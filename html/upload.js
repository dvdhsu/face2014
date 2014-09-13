$(document).on("ready", function(){
  filepicker.setKey('AMD8NudmhSUG7kDcXxqNDz');
  var uploaded = false;
   
  function curriedPreview(preview, img) {
    return function showPreview(c) {
      // fix bug with scaling image
      naturalHeight = img.naturalHeight;
      height = img.height;
      scaleFactor = naturalHeight / height;

      if (!preview) {
        // reset height and width
        $('.jcrop-active').attr("style", "max-height: 100%; max-width: 100%;");

        // append the preview
        preview = $("<canvas id=\"preview\" width=\"200\" height=\"200\">");
        $('.modal-body').append(preview);
      }

      // draw the preview on the canvas
      preview[0].getContext("2d").drawImage(img, c.x * scaleFactor, c.y * scaleFactor, c.w * scaleFactor, 
  	                                 c.h * scaleFactor, 0, 0, 200, 200);
    }
  }
  
  $('#uploadFaceButton').click(function(e) {
    e.preventDefault();

    filepicker.pick(function(InkBlob){
      var preview = document.getElementById("preview");
      var img = $('#uploadedImage');

      // if there's an image already, delete and reset jcrop
      if (uploaded) {
        img.data('Jcrop').destroy();
        $('#preview').detach();
        preview = null;
      }

      $('#uploadedImage').attr("src", InkBlob.url);
      
      $('#uploadedImage').Jcrop({
        onChange: curriedPreview(preview, img[0]),
        onSelect: curriedPreview(preview, img[0]),
        aspectRatio: 1, 
        bgOpacity: .4
      });

      uploaded = true;
    });

  });
});
