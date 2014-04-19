app.controller('FaceController', function($scope, Images) {
    // query our images resource
    Images.get(function(data) {
        $scope.data = data;
    });
});
