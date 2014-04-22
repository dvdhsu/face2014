var app = angular.module('Face2014', ['ngResource']);

app.factory('Images', function($resource) {
    return $resource("/api/v1/pickimages");
});

app.factory('Image', function($resource) {
    return $resource("/api/v1/pickimage");
});
