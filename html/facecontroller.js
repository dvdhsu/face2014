app.controller('FaceController', function($scope, $interval, Images, Image) {
    // query our images resource
    Images.get(function(data) {
        $scope.data = data;
    });

    $interval(function() {
        Image.get(function(data) {
            console.log(data);
            $scope.data.rows[data['row']].images[data['column']].url = data['image'];
        });
    }, 5000);
});
