(function(window, document) {

// Create all modules and define dependencies to make sure they exist
// and are loaded in the correct order to satisfy dependency injection
// before all nested files are concatenated by Grunt

// Config
angular.module('ngS3upload.config', []).
  value('ngS3upload.config', {
      debug: true
  }).
  config(['$compileProvider', function($compileProvider){
    if (angular.isDefined($compileProvider.urlSanitizationWhitelist)) {
      $compileProvider.urlSanitizationWhitelist(/^\s*(https?|ftp|mailto|file|data):/);
    } else {
      $compileProvider.aHrefSanitizationWhitelist(/^\s*(https?|ftp|mailto|file|data):/);
    }
  }]);

// Modules
angular.module('ngS3upload.directives', []);
angular.module('ngS3upload',
    [
        'ngS3upload.config',
        'ngS3upload.directives',
        'ngS3upload.services',
        'ngSanitize'
    ]);
angular.module('ngS3upload.services', []).
  service('S3Uploader', ['$http', '$q', '$window', function ($http, $q, $window) {
    this.uploads = 0;
    var self = this;

    this.getUploadOptions = function (uri, file) {
      console.log('getting sig from ' + uri);
      var deferred = $q.defer();

      // add filename and filetype parameters.
      // this allows us to construct the correct signature server side.
      console.log(file);
      uri = uri + '?type=' + file.type +'&name=' + file.name;
      console.log(uri);
      $http.get(uri).
        success(function (response, status) {
          console.log('got sig');
          deferred.resolve(response);
        }).error(function (error, status) {
          deferred.reject(error);
        });

      return deferred.promise;
    };

    this.randomString = function (length) {
      var chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
      var result = '';
      for (var i = length; i > 0; --i) result += chars[Math.round(Math.random() * (chars.length - 1))];

      return result;
    };


    this.upload = function (scope, signed_request, s3_object_name, file) {

      var deferred = $q.defer();
      scope.attempt = true;

      var xhr = new XMLHttpRequest();

      xhr.upload.addEventListener("progress", uploadProgress, false);
      xhr.addEventListener("load", uploadComplete, false);
      xhr.addEventListener("error", uploadFailed, false);
      xhr.addEventListener("abort", uploadCanceled, false);
      scope.$emit('s3upload:start', xhr);

      // Define event handlers
      function uploadProgress(e) {
        scope.$apply(function () {
          if (e.lengthComputable) {
            scope.progress = Math.round(e.loaded * 100 / e.total);
          } else {
            scope.progress = 'unable to compute';
          }
          var msg = {type: 'progress', value: scope.progress};
          console.log(msg);
          scope.$emit('s3upload:progress', msg);
          if (typeof deferred.notify === 'function') {
            deferred.notify(msg);
          }

        });
      }
      function uploadComplete(e) {
        var xhr = e.srcElement || e.target;
        scope.$apply(function () {
          self.uploads--;
          scope.uploading = false;
          console.log('done');
          console.log(xhr.status);
          if (xhr.status === 204 || xhr.status == 200) { // successful upload
            console.log('success');
            scope.success = true;
            deferred.resolve(xhr);

            // create thumbnail upon upload completion.
            var thumbnail_xhr = new XMLHttpRequest();
            var thumbnail_url = '/api/v1/thumbnailer';
            thumbnail_url = thumbnail_url + '?s3_object_name=' + s3_object_name;
            console.log(thumbnail_url)

            thumbnail_xhr.open('POST', thumbnail_url, true);
            thumbnail_xhr.send();

            scope.$emit('s3upload:success', xhr);
          } else {
            scope.success = false;
            deferred.reject(xhr);
            scope.$emit('s3upload:error', xhr);
          }
        });
      }
      function uploadFailed(e) {
        var xhr = e.srcElement || e.target;
        scope.$apply(function () {
          self.uploads--;
          scope.uploading = false;
          scope.success = false;
          deferred.reject(xhr);
          scope.$emit('s3upload:error', xhr);
        });
      }
      function uploadCanceled(e) {
        var xhr = e.srcElement || e.target;
        scope.$apply(function () {
          self.uploads--;
          scope.uploading = false;
          scope.success = false;
          deferred.reject(xhr);
          scope.$emit('s3upload:abort', xhr);
        });
      }

      // Send the file
      scope.uploading = true;
      this.uploads++;
      console.log('posting to ' + signed_request);
      xhr.open('PUT', signed_request, true);

      xhr.setRequestHeader('Content-Type', file.type);
      xhr.setRequestHeader('x-amz-acl', 'public-read');

      console.log('sending form data');
      xhr.send(file);

      return deferred.promise;
    };

    this.isUploading = function () {
      return this.uploads > 0;
    };
  }]);
angular.module('ngS3upload.directives', []).
  directive('s3Upload', ['$parse', 'S3Uploader', function ($parse, S3Uploader) {
    return {
      restrict: 'AC',
      require: '?ngModel',
      replace: true,
      transclude: false,
      scope: true,
      controller: ['$scope', '$element', '$attrs', '$transclude', function ($scope, $element, $attrs, $transclude) {
        $scope.attempt = false;
        $scope.success = false;
        $scope.uploading = false;

        $scope.barClass = function () {
          return {
            "bar-success": $scope.attempt && !$scope.uploading && $scope.success
          };
        };
      }],
      compile: function (element, attr, linker) {
        return {
          pre: function ($scope, $element, $attr) {
            if (angular.isUndefined($attr.bucket)) {
              throw Error('bucket is a mandatory attribute');
            }
          },
          post: function (scope, element, attrs, ngModel) {
            // Build the opts array
            var opts = angular.extend({}, scope.$eval(attrs.s3UploadOptions || attrs.options));
            opts = angular.extend({
              submitOnChange: true,
              getOptionsUri: '/getS3Options',
              acl: 'public-read',
              uploadingKey: 'uploading',
              folder: ''
            }, opts);
            var bucket = scope.$eval(attrs.bucket);

            // Bind the button click event
            var button = angular.element(element.children()[0]),
              file = angular.element(element.find("input")[0]);
            button.bind('click', function (e) {
              file[0].click();
            });

            // Update the scope with the view value
            ngModel.$render = function () {
              scope.filename = ngModel.$viewValue;
            };

            var uploadFile = function () {
              var selectedFile = file[0].files[0];
              var filename = selectedFile.name;
              var ext = filename.split('.').pop();

              scope.$apply(function () {
                S3Uploader.getUploadOptions(opts.getOptionsUri, selectedFile).then(function (s3Options) {
                  ngModel.$setValidity('uploading', false);
                  var s3Uri = 'https://' + bucket + '.s3.amazonaws.com/';
                  var key = opts.folder + (new Date()).getTime() + '-' + S3Uploader.randomString(16) + "." + ext;
                  S3Uploader.upload(scope,
                      s3Options.signed_request,
                      s3Options.s3_object_name,
                      selectedFile
                    ).then(function () {
                      ngModel.$setViewValue(s3Uri + key);
                      scope.filename = ngModel.$viewValue;
                      ngModel.$setValidity('uploading', true);
                      ngModel.$setValidity('succeeded', true);
                    }, function () {
                      scope.filename = ngModel.$viewValue;
                      ngModel.$setValidity('uploading', true);
                      ngModel.$setValidity('succeeded', false);
                    });

                }, function (error) {
                  throw Error("Can't receive the needed options for S3 " + error);
                });
              });
            };

            element.bind('change', function (nVal) {
              if (opts.submitOnChange) {
                uploadFile();
              }
            });
          }
        };
      },
      template: '<div class="upload-wrap">' +
        '<button class="btn btn-primary" type="button"><span ng-if="!filename">Choose file</span><span ng-if="filename">Replace file</span></button>' +
        '<a ng-href="{{ filename  }}" target="_blank" class="" ng-if="filename" > Stored file </a>' +
        '<div class="progress progress-striped" ng-class="{active: uploading}" ng-show="attempt" style="margin-top: 10px">' +
        '<div class="bar" style="width: {{ progress }}%;" ng-class="barClass()"></div>' +
        '</div>' +
        '<input type="file" style="display: none"/>' +
        '</div>'
    };
  }]);
})(window, document);
