app.controller('FaceController', function($scope, $interval, Images, Image) {
    // query our images resource
    Images.get(function(data) {
        $scope.data = data;
    });

    $interval(function() {
        Image.get(function(data) {
            $scope.data.rows[data['row']].images[data['column']].url = data['image'];
        });
    }, 5000);
});

app.directive(
    'bnFadeHelper',
    function() {

        // add the fader image to the DOM.
        function compile(element, attributes, transclude){
            element.prepend('<img class="fader"/>');
            return(link);
        }

        // bind ui events.
        function link($scope, element, attributes){
            var fader = element.find('img.fader');
            var primary = element.find('img.primary');


            // watch for image changes.
            $scope.$watch(
                'image.url',
                function(newValue, oldValue){
                    if (newValue === oldValue){
                        return;
                    }

                    if (isFading()){
                        return;
                    }

                    initFade(oldValue);

                });

            // prepare the fader.
            function initFade(fadeSource) {
                fader.prop('src', fadeSource);
                fader.addClass('show');
                primary.one('load', startFade);
            }

            function isFading(){
                return(
                    fader.hasClass('show') ||
                    fader.hasClass('fadeOut')
                      );
            }

            function startFade(){
                fader.width();
                fader.addClass('fadeOut');
                setTimeout(teardownFade, 1000);
            }

            function teardownFade(){
                fader.removeClass('show fadeOut');
            }
        }

        return({
            compile: compile,
            restrict: "A"});
    });
