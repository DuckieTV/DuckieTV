/**
 * Handle global dependencies
 */
var DuckieTV = angular.module('DuckieTV', [
  'formly',
  'formlyBootstrap',
  'xmlrpc',
  'ct.ui.router.extras.core',
  'ct.ui.router.extras.sticky',
  'ngLocale',
  'ngAnimate',
  'ngMessages',
  'tmh.dynamicLocale',
  'ui.bootstrap',
  'dialogs.main',
  'pascalprecht.translate',
  'DuckieTorrent.torrent',
  'angular-dialgauge'
])

/**
 * Disable debug info for speed improvements
 */
  .config(['$compileProvider', function($compileProvider) {
    if (localStorage.getItem('optin_error_reporting')) {
      $compileProvider.debugInfoEnabled(true)
    } else {
      $compileProvider.debugInfoEnabled(false)
    }
  }])

/**
 * Unsafe HTML entities pass-through.
 */
  .filter('unsafe', ['$sce',
    function($sce) {
      return function(val) {
        return $sce.trustAsHtml(val)
      }
    }
  ])

/**
 * Filter for calendar events as used by templates/datepicker.html for instance.
 */
  .filter('filterEvents',
    function() {
      return function(events) {
        return events.filter(function(event) {
          if (!event.serie) return false
          if (event.serie.displaycalendar == 0) return false
          else return true
        })
      }
    }
  )

/**
 * at start-up set up a timer to refresh DuckieTV a second after midnight, to force a calendar date refresh
 */
  .run([function() {
    var today = new Date()
    var tommorow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
    var timeToMidnight = (tommorow - today) + 1000 // a second after midnight
    var timer = setTimeout(function() {
      window.location.reload()
    }, timeToMidnight)
  }])

  .run(['$rootScope', '$state', function($rootScope, $state) {
    $rootScope.$on('$stateChangeStart',
      function(e, toState, toParams, fromState, fromParams) {
        if (!toState.views) {
          return
        }
        Object.keys(toState.views).map(function(viewname) {
          var view = document.querySelector('[ui-view=' + viewname.split('@')[0] + ']')
          if (view) view.classList.add('ui-loading')
        })
      })

    $rootScope.$on('$stateChangeSuccess',
      function(e, toState, toParams, fromState, fromParams) {
        if (!toState.views) {
          return
        }
        Object.keys(toState.views).map(function(viewname) {
          var view = document.querySelector('[ui-view=' + viewname.split('@')[0] + ']')
          if (view) view.classList.remove('ui-loading')
        })
      })
  }])

/**
 * setting platform specific defaults (uTorrent for windows, uTorrent Web UI or non-windows)
 */
  .run(['SettingsService', function(SettingsService) {
    if (!localStorage.getItem('torrenting.client')) {
      if (navigator.platform.toLowerCase().indexOf('win') !== -1) {
        localStorage.setItem('torrenting.client', 'uTorrent') // default for windows platforms
        SettingsService.set('torrenting.client', 'uTorrent') // for use in templates
      } else {
        localStorage.setItem('torrenting.client', 'uTorrent Web UI') // default for non-windows platforms
        SettingsService.set('torrenting.client', 'uTorrent Web UI') // for use in templates
      }
    } else {
      if (localStorage.getItem('torrenting.client') === 'uTorrent' && navigator.platform.toLowerCase().indexOf('win') === -1) {
        localStorage.setItem('torrenting.client', 'uTorrent Web UI') // override for non-windows platforms prior to #592
        SettingsService.set('torrenting.client', 'uTorrent Web UI') // for use in templates
      }
    }
  }])

/**
 * at start-up set up some formly custom types
 */
  .run(['formlyConfig',
    function(formlyConfig) {
      /**
         * define a form wrapper for formly type=number to provide error message support.
         */
      formlyConfig.setWrapper([{
        template: [
          '<div class="formly-template-wrapper form-group"',
          'ng-class="{\'has-error\': options.validation.errorExistsAndShouldBeVisible}">',
          '<formly-transclude></formly-transclude>',
          '<div class="alert alert-danger"',
          'ng-if="options.validation.errorExistsAndShouldBeVisible"',
          'ng-messages="options.formControl.$error">',
          '<div ng-message="{{::name}}" ng-repeat="(name, message) in ::options.validation.messages">',
          '{{message(options.formControl.$viewValue, options.formControl.$modelValue, this)}}',
          '</div>',
          '</div>',
          '</div>'
        ].join(' '),
        types: ['integer', 'delay']
      }])

      /**
         * define a custom extension to formly type=input, so the wrapper above gets tied to only type=integer instead of all of the input types.
         */
      formlyConfig.setType({
        name: 'integer',
        extends: 'input',
        defaultOptions: function(options) {
          return {
            templateOptions: {
              type: 'number',
              pattern: '[0-9]{0,}',
              label: '',
              placeholder: ''
            }
          }
        }
      })

      /**
         * define a custom extension to formly type=input, so the wrapper above can be tied to it.
         */
      formlyConfig.setType({
        name: 'delay',
        extends: 'input',
        defaultOptions: function(options) {
          return {
            templateOptions: {
              type: 'text',
              label: '',
              placeholder: ''
            }
          }
        }
      })

      /**
         * define a custom extension to formly type=input, which defines a html input type=file dialog, that fetches a directory path instead of a file.
         */
      formlyConfig.setType({
        name: 'directory',
        extends: 'input',
        template: [
          '&nbsp;',
          '{{model[options.key]}}',
          '<input type="file"',
          'downloadpath="model[options.key]"',
          'nwdirectory directory',
          '/>'
        ].join(' ')
      })

      /**
         * define a custom formly type=button.
         */
      formlyConfig.setType({
        name: 'button',
        template: [
          '<div>',
          '<button type="{{::to.type}}"',
          'class="btn btn-{{::to.btnType}}"',
          'ng-click="onClick($event)">',
          '{{to.text}}',
          '</button>',
          '</div>'
        ].join(' '),
        wrapper: ['bootstrapLabel'],
        defaultOptions: {
          templateOptions: {
            btnType: 'default',
            type: 'button'
          },
          extras: {
            skipNgModelAttrsManipulator: true // <-- performance optimization because this type has no ng-model
          }
        },
        controller: ['$scope', function($scope) {
          $scope.onClick = onClick

          function onClick($event) {
            if (angular.isString($scope.to.onClick)) {
              return $scope.$eval($scope.to.onClick, {
                $event: $event
              })
            } else {
              return $scope.to.onClick($event)
            }
          }
        }],
        apiCheck: function(check) {
          return {
            templateOptions: {
              onClick: check.oneOfType([check.string, check.func]),
              type: check.string.optional,
              btnType: check.string.optional,
              text: check.string
            }
          }
        }
      })
    }
  ])
;
/**
 * A special decorator that modifies $httpBackend with a basically 1:1 copy of it, with one big twist.
 * it fixes angular bug #1678 ( https://github.com/angular/angular.js/issues/1678 )
 * Passing on username/password for XHR requests ($http)
 *
 * Interface:
 * Instead of passing a text HTTP Authorization header for authenticated requests,
 * pass it a username and a password in an array
 *
 * Example:
 * $http.get('http://myUrl/endpoint', { headers: { Authorization: ['admin','password']}});
 *
 * dependants: AngularJS 1.5.10 https://github.com/SchizoDuckie/DuckieTV/issues/815
 *                      at some point after AngularJS 1.5.6, callbacks.counter became callbacks.$$counter
 *
 */

DuckieTV.config(['$provide', function($provide) {
  $provide.decorator('$httpBackend', ['$delegate', '$browser', '$window', '$document', function($delegate, $browser, $window, $document) {
    function createXhr() {
      return new window.XMLHttpRequest()
    }

    function createHttpAuthBackend($browser, createXhr, $browserDefer, callbacks, rawDocument) {
      // TODO(vojta): fix the signature
      return function(method, url, post, callback, headers, timeout, withCredentials, responseType) {
        function noop() {}

        function isPromiseLike(obj) {
          return obj && isFunction(obj.then)
        }

        function isDefined(value) {
          return typeof value !== 'undefined'
        }

        function isFunction(value) {
          return typeof value === 'function'
        }

        function addEventListenerFn(element, type, fn) {
          element.addEventListener(type, fn, false)
        }

        function removeEventListenerFn(element, type, fn) {
          element.removeEventListener(type, fn, false)
        }

        with (angular) {
          $browser.$$incOutstandingRequestCount()
          url = url || $browser.url()

          if (method.toLowerCase() == 'jsonp') {
            var callbackId = '_' + (callbacks.$$counter++).toString(36)
            callbacks[callbackId] = function(data) {
              callbacks[callbackId].data = data
              callbacks[callbackId].called = true
            }

            var jsonpDone = jsonpReq(url.replace('JSON_CALLBACK', 'angular.callbacks.' + callbackId),
              callbackId, function(status, text) {
                completeRequest(callback, status, callbacks[callbackId].data, '', text)
                callbacks[callbackId] = noop
              })
          } else {
            var xhr = createXhr()

            if (isDefined(headers) && isDefined(headers.Authorization) && headers.Authorization.length == 2) {
              xhr.open(method, url, true, headers.Authorization[0], headers.Authorization[1])
              delete headers.Authorization
            } else {
              xhr.open(method, url, true)
            }

            forEach(headers, function(value, key) {
              if (isDefined(value)) {
                xhr.setRequestHeader(key, value)
              }
            })

            xhr.onload = function requestLoaded() {
              var statusText = xhr.statusText || ''

              // responseText is the old-school way of retrieving response (supported by IE8 & 9)
              // response/responseType properties were introduced in XHR Level2 spec (supported by IE10)
              var response = ('response' in xhr) ? xhr.response : xhr.responseText

              // normalize IE9 bug (http://bugs.jquery.com/ticket/1450)
              var status = xhr.status === 1223 ? 204 : xhr.status

              // fix status code when it is 0 (0 status is undocumented).
              // Occurs when accessing file resources or on Android 4.1 stock browser
              // while retrieving files from application cache.
              if (status === 0) {
                status = response ? 200 : urlResolve(url).protocol == 'file' ? 404 : 0
              }

              completeRequest(callback,
                status,
                response,
                xhr.getAllResponseHeaders(),
                statusText)
            }

            var requestError = function() {
              // The response is always empty
              // See https://xhr.spec.whatwg.org/#request-error-steps and https://fetch.spec.whatwg.org/#concept-network-error
              completeRequest(callback, -1, null, null, '')
            }

            xhr.onerror = requestError
            xhr.onabort = requestError

            if (withCredentials) {
              xhr.withCredentials = true
            }

            if (responseType) {
              try {
                xhr.responseType = responseType
              } catch (e) {
                // WebKit added support for the json responseType value on 09/03/2013
                // https://bugs.webkit.org/show_bug.cgi?id=73648. Versions of Safari prior to 7 are
                // known to throw when setting the value "json" as the response type. Other older
                // browsers implementing the responseType
                //
                // The json response type can be ignored if not supported, because JSON payloads are
                // parsed on the client-side regardless.
                if (responseType !== 'json') {
                  throw e
                }
              }
            }

            xhr.send(post)
          }

          if (timeout > 0) {
            var timeoutId = $browserDefer(timeoutRequest, timeout)
          } else if (isPromiseLike(timeout)) {
            timeout.then(timeoutRequest)
          }

          function timeoutRequest() {
            jsonpDone && jsonpDone()
            xhr && xhr.abort()
          }

          function completeRequest(callback, status, response, headersString, statusText) {
            // cancel timeout and subsequent timeout promise resolution
            if (timeoutId !== undefined) {
              $browserDefer.cancel(timeoutId)
            }
            jsonpDone = xhr = null

            callback(status, response, headersString, statusText)
            $browser.$$completeOutstandingRequest(noop)
          }
        }

        function jsonpReq(url, callbackId, done) {
          // we can't use jQuery/jqLite here because jQuery does crazy stuff with script elements, e.g.:
          // - fetches local scripts via XHR and evals them
          // - adds and immediately removes script elements from the document
          var script = rawDocument.createElement('script')

          var callback = null
          script.type = 'text/javascript'
          script.src = url
          script.async = true

          callback = function(event) {
            removeEventListenerFn(script, 'load', callback)
            removeEventListenerFn(script, 'error', callback)
            rawDocument.body.removeChild(script)
            script = null
            var status = -1
            var text = 'unknown'

            if (event) {
              if (event.type === 'load' && !callbacks[callbackId].called) {
                event = {
                  type: 'error'
                }
              }
              text = event.type
              status = event.type === 'error' ? 404 : 200
            }

            if (done) {
              done(status, text)
            }
          }

          addEventListenerFn(script, 'load', callback)
          addEventListenerFn(script, 'error', callback)
          rawDocument.body.appendChild(script)
          return callback
        }
      }
    }
    return createHttpAuthBackend($browser, createXhr, $browser.defer, $window.angular.callbacks, $document[0])
  }])
}])
;
/**
 * Inject a (dev-env only) HTTP request interceptor that transparently proxies your requests to an external server and saves them
 */
DuckieTV.factory('TransparentFixtureProxyInterceptor', ['$q', '$injector',
  function($q, $injector) {
    if (document.domain == 'localhost') { // or the domain your dev instance runs on
      return {
        request: function(config) {
          if (config.url.indexOf('localhost') === -1 && config.url.indexOf('http') === 0) {
            config.url = './tests/proxy.php?url=' + encodeURIComponent(config.url)
          }
          return config
        }
      }
    } else {
      return {}
    }
  }
])

  .config(['$httpProvider', '$compileProvider',
    function($httpProvider, $compileProvider) {
      if (document.domain == 'localhost') {
        $httpProvider.interceptors.push('TransparentFixtureProxyInterceptor')
      }
    }
  ])

/**
 * Inject a cross-domain enabling http proxy for the non-chrome extension function
 * Sweeeeet
 */
  .factory('CORSInterceptor', ['$q', '$injector',
    function($q, $injector) {
      return {
        request: function(config) {
          if (document.domain != 'localhost' && config.url.indexOf('http') == 0 && config.url.indexOf('localhost') === -1) {
            config.headers['X-Proxy-Url'] = config.url
            if (config.url.indexOf('http://duckietv.herokuapp.com/') == -1) config.url = 'http://duckietv.herokuapp.com/?t=' + new Date().getTime() + '&u=' + config.url
          }
          return config
        },
        'responseError': function(rejection) {
          if ('recovered' in rejection.config) {
            return rejection
          }
          rejection.config.recovered = true
          var $http = $injector.get('$http')
          return $http(rejection.config)
        }

      }
    }
  ])

/**
 * Set up the xml interceptor and whitelist the chrome extension's filesystem and magnet links
 */
  .config(['$httpProvider', '$compileProvider',
    function($httpProvider, $compileProvider) {
      if (window.location.href.indexOf('chrome-extension') === -1 && navigator.userAgent.indexOf('DuckieTV') == -1 && window.location.href.indexOf('file://') === -1) {
        $httpProvider.interceptors.push('CORSInterceptor')
      }
      $compileProvider.aHrefSanitizationWhitelist(/^\s*(https?|ftp|blob|mailto|chrome-extension|magnet|data|file):/)
      $compileProvider.imgSrcSanitizationWhitelist(/^\s*(https?|ftp|file):|data:image|filesystem:|chrome-extension:/)
    }
  ])
;
/**
 * Routing configuration.
 */
DuckieTV.config(['$stateProvider', '$urlRouterProvider',
  function($stateProvider, $urlRouterProvider) {
    function showSidePanel(SidePanelState) {
      SidePanelState.show()
      return SidePanelState
    }

    function expandSidePanel(SidePanelState) {
      if (!SidePanelState.state.isShowing) {
        SidePanelState.show()
      }
      SidePanelState.expand()
      return SidePanelState
    }

    function expandSidePanelIfOpen(SidePanelState) {
      if (SidePanelState.state.isShowing) {
        SidePanelState.expand()
      } else {
        SidePanelState.show()
      }
      return SidePanelState
    }

    function hideSidePanel(SidePanelState) {
      SidePanelState.hide()
      return SidePanelState
    }

    function findEpisodes($stateParams) {
      return Episode.findByID_Season($stateParams.season_id)
    }

    function findEpisode($stateParams) {
      return Episode.findByID($stateParams.episode_id)
    }

    function findSeasonByID($stateParams) {
      return Season.findByID($stateParams.season_id)
    }

    function findSerieByID($stateParams) {
      return Serie.findByID($stateParams.id)
    }

    function hideAddingList(SeriesAddingState) {
      SeriesAddingState.hide()
      return SeriesAddingState
    }

    function hideSeriesList(SeriesListState) {
      SeriesListState.hide()
      return SeriesListState
    }

    function showSeriesList(SeriesListState) {
      SeriesListState.show()
      return SeriesListState
    }

    function showAddingList(SeriesAddingState) {
      SeriesAddingState.show()
      return SeriesAddingState
    }

    // if the path doesn't match any of the urls you configured
    // otherwise will take care of routing the user to the specified url

    $stateProvider
      .state('calendar', {
        url: '/',
        resolve: {
          SidePanelState: hideSidePanel,
          SeriesAddingState: hideAddingList,
          SeriesListState: hideSeriesList
        }
      })

      .state('favorites', {
        url: '/favorites',
        sticky: true,
        resolve: {
          SidePanelState: hideSidePanel,
          SeriesListState: showSeriesList,
          SeriesAddingState: hideAddingList,
          FavoritesService: function(FavoritesService) {
            return FavoritesService.waitForInitialization().then(function() {
              return FavoritesService
            })
          }
        },

        views: {
          favorites: {
            templateUrl: 'templates/seriesList.html',
            controller: 'seriesListCtrl',
            controllerAs: 'serieslist',
            bindToController: true
          },
          'tools@favorites': {
            templateUrl: 'templates/serieslist/tools/favorites.html',
            controller: 'localSeriesCtrl',
            controllerAs: 'localFilter',
            bindToController: true
          },
          'content@favorites': {
            templateUrl: 'templates/serieslist/favorites.html',
            controller: 'localSeriesCtrl',
            controllerAs: 'local',
            bindToController: true
          }
        }
      })

      .state('favorites.search', {
        url: '/search',
        views: {
          'tools@favorites': {
            templateUrl: 'templates/serieslist/tools/localfilter.html',
            controller: 'localSeriesCtrl',
            controllerAs: 'localFilter',
            bindToController: true
          },
          'content@favorites': {
            templateUrl: 'templates/serieslist/searchresults.html'
          }
        }
      })

      .state('add_favorites', {
        url: '/add',
        sticky: true,
        resolve: {
          SidePanelState: hideSidePanel,
          SeriesListState: hideSeriesList,
          SeriesAddingState: showAddingList
        },
        views: {
          favorites: {
            templateUrl: 'templates/seriesList.html',
            controller: 'seriesListCtrl',
            controllerAs: 'serieslist',
            bindToController: true
          },
          'tools@add_favorites': {
            templateUrl: 'templates/serieslist/tools/adding.html',
            controller: ['$state', '$stateParams', function($state, $stateParams) {
              this.query = $stateParams.query
              this.search = function(q) {
                if (q.length > 0) {
                  $state.go('add_favorites.search', {
                    query: q
                  })
                } else {
                  $state.go('add_favorites')
                }
              }
            }],
            controllerAs: 'search',
            bindToController: true
          },
          'content@add_favorites': {
            templateUrl: 'templates/serieslist/trakt-trending.html',
            controller: 'traktTvTrendingCtrl',
            controllerAs: 'trending'
          }
        }
      })

      .state('add_favorites.search', {
        url: '/search/:query',
        views: {
          'content@add_favorites': {
            templateUrl: 'templates/serieslist/trakt-searching.html',
            controller: 'traktTvSearchCtrl',
            controllerAs: 'traktSearch'
          }
        }

      })

      .state('add_favorites.search.trakt-serie', {
        url: '/:id',
        params: {
          serie: {}
        },
        resolve: {
          SidePanelState: showSidePanel,
          serie: function($stateParams) {
            return $stateParams.serie
          }
        },
        views: {
          'sidePanel@': {
            templateUrl: 'templates/sidepanel/trakt-serie-details.html',
            controller: 'sidepanelTraktSerieCtrl',
            controllerAs: 'sidepanel'
          }
        }
      })

      .state('add_favorites.trakt-serie', {
        url: '/info/:id',
        resolve: {
          SidePanelState: showSidePanel,
          serie: function($state, $stateParams, TraktTVTrending) {
            return TraktTVTrending.getByTraktId($stateParams.id)
          }
        },
        views: {
          'sidePanel@': {
            templateUrl: 'templates/sidepanel/trakt-serie-details.html',
            controller: 'sidepanelTraktSerieCtrl',
            controllerAs: 'sidepanel'
          }
        }
      })

      .state('watchlist', {
        url: '/watchlist',
        resolve: {
          SidePanelState: function(SidePanelState) {
            setTimeout(function() {
              expandSidePanel(SidePanelState)
            }, 0)
          }
        },
        views: {
          sidePanel: {
            templateUrl: 'templates/watchlist.html'
          }
        }
      })

    // note: separate state from serie.season.episode navigation because we want to only open the sidepanel from the calendar, not expand it
      .state('episode', {
        url: '/episode/:episode_id',
        resolve: {
          SidePanelState: showSidePanel,
          serie: function($stateParams) {
            return Serie.findOneByEpisode({
              ID_Episode: $stateParams.episode_id
            })
          },
          season: function($stateParams) {
            return Serie.findOneByEpisode({
              ID_Episode: $stateParams.episode_id
            }).then(function(result) {
              return result.getActiveSeason()
            })
          },
          episode: findEpisode
        },

        views: {
          'sidePanel': {
            controller: 'SidepanelEpisodeCtrl',
            controllerAs: 'sidepanel',
            templateUrl: 'templates/sidepanel/episode-details.html'
          }
        }
      })

      .state('serie', {
        url: '/series/:id',
        resolve: {
          SidePanelState: showSidePanel,
          serie: findSerieByID
        },
        views: {
          sidePanel: {
            templateUrl: 'templates/sidepanel/serie-overview.html',
            controller: 'SidepanelSerieCtrl',
            controllerAs: 'sidepanel'
          }
        }
      })

      .state('serie.details', {
        url: '/details',
        resolve: {
          SidePanelState: expandSidePanel
        },
        views: {
          serieDetails: {
            templateUrl: 'templates/sidepanel/serie-details.html'
          }
        }
      })

      .state('serie.seasons', {
        url: '/seasons',
        resolve: {
          SidePanelState: expandSidePanel,
          seasons: function($stateParams) {
            return Season.findBySerie({
              ID_Serie: $stateParams.id
            })
          }
        },
        views: {
          serieDetails: {
            controller: 'SidepanelSeasonsCtrl',
            controllerAs: 'seasons',
            templateUrl: 'templates/sidepanel/seasons.html'
          }
        }
      })

    // note: this is a sub state of the serie state. the serie is already resolved here and doesn't need to be redeclared!
      .state('serie.season', {
        url: '/season/:season_id',
        resolve: {
          SidePanelState: expandSidePanel,
          season: findSeasonByID,
          episodes: findEpisodes,
          seasons: function($stateParams) {
            return Season.findBySerie({
              ID_Serie: $stateParams.id
            })
          }
        },
        views: {
          serieDetails: {
            templateUrl: 'templates/sidepanel/episodes.html',
            controller: 'SidepanelSeasonCtrl',
            controllerAs: 'season'
          }
        }
      })

    // note: this is a sub state of the serie state. the serie is already resolved here and doesn't need to be redeclared!
      .state('serie.season.episode', {
        url: '/episode/:episode_id',
        resolve: {
          SidePanelState: expandSidePanelIfOpen,
          episode: findEpisode
        },
        views: {
          'sidePanel@': {
            controller: 'SidepanelEpisodeCtrl',
            controllerAs: 'sidepanel',
            templateUrl: 'templates/sidepanel/episode-details.html'
          },
          'serieDetails@serie.season.episode': {
            templateUrl: 'templates/sidepanel/episodes.html',
            controller: 'SidepanelSeasonCtrl',
            controllerAs: 'season'
          }
        }
      })

      .state('settings', {
        url: '/settings',
        resolve: {
          SidePanelState: showSidePanel
        },
        views: {
          sidePanel: {
            templateUrl: 'templates/sidepanel/settings.html',
            controller: 'SettingsCtrl'
          }
        }
      })

      .state('settings.tab', {
        url: '/:tab',
        resolve: {
          SidePanelState: expandSidePanel
        },
        views: {
          settingsTab: {
            templateUrl: function($stateParams) {
              return 'templates/settings/' + $stateParams.tab + '.html'
            }
          }
        }
      })

      .state('torrent', {
        url: '/torrent',
        resolve: {
          SidePanelState: showSidePanel
        },
        views: {
          sidePanel: {
            templateUrl: 'templates/torrentClient.html',
            controller: 'TorrentCtrl',
            controllerAs: 'client'
          }
        }
      })

      .state('torrent.details', {
        url: '/:id',
        params: {
          torrent: {}
        },
        resolve: {
          SidePanelState: expandSidePanel,
          torrent: function($stateParams, SidePanelState) {
            if (!('getName' in $stateParams.torrent)) {
              setTimeout(SidePanelState.show, 500) // contract sidepanel on page refresh, and not torrent
            }
            return $stateParams.torrent
          }
        },
        views: {
          torrentDetails: {
            templateUrl: function($stateParams) {
              return 'templates/torrentClient.details.html'
            },
            controller: 'TorrentDetailsCtrl',
            controllerAs: 'vm'
          }
        }
      })

      .state('about', {
        url: '/about',
        resolve: {
          SidePanelState: function(SidePanelState) {
            setTimeout(function() {
              expandSidePanel(SidePanelState)
            }, 0)
          }
        },
        views: {
          sidePanel: {
            templateUrl: 'templates/sidepanel/about.html',
            controller: 'AboutCtrl'
          }
        }
      })

      .state('autodlstatus', {
        url: '/autodlstatus',
        resolve: {
          SidePanelState: function(SidePanelState) {
            setTimeout(function() {
              expandSidePanel(SidePanelState)
            }, 0)
          }
        },
        views: {
          sidePanel: {
            templateUrl: 'templates/sidepanel/autodlstatus.html',
            controller: 'AutodlstatusCtrl'
          }
        }
      })

      .state('videoplayer', {
        url: '/videoplayer',
        resolve: {
          SidePanelState: function(SidePanelState) {
            setTimeout(function() {
              expandSidePanel(SidePanelState)
            }, 0)
          }
        },
        views: {
          sidePanel: {
            templateUrl: 'templates/sidepanel/synology.html',
            controller: 'SynologyDSVideoCtrl',
            controllerAs: 'syno'
          }
        }
      })

    $urlRouterProvider.otherwise('/')
  }
])
;
/**
 * DuckieTV Standalone update check
 * Fetches the latest release from github every 2 days and diffs it with the local version
 */
DuckieTV.run(['$http', 'dialogs', 'SettingsService',
  function($http, dialogs, SettingsService) {
    if (SettingsService.isStandalone()) {
      // check last updated every 2 days.
      var updateDialog = false
      var lastUpdateCheck = localStorage.getItem('github.lastupdatecheck')
      if (!lastUpdateCheck || lastUpdateCheck + (60 * 60 * 24 * 2 * 1000) < new Date().getTime()) {
        $http.get('https://api.github.com/repos/SchizoDuckie/DuckieTV/releases').then(function(result) {
          result = result.data
          // store current update time.
          localStorage.setItem('github.lastupdatecheck', new Date().getTime())
          // if release is older than current version, skip.
          if (parseFloat(result[0].tag_name) <= parseFloat(navigator.userAgent.replace('DuckieTV Standalone v', ''))) {
            return
          }
          // if release was dismissed, skip.
          var settingsKey = 'notification.dontshow.' + result[0].tag_name
          if (!localStorage.getItem(settingsKey)) {
            return
          }
          var releasenotes = '\n' + result[0].body
          var dlg = dialogs.confirm('New DuckieTV release!', [
            'A new version of DuckieTV is available (v', result[0].tag_name, ', released ', new Date(result[0].published_at).toLocaleDateString(), ')<br>',
            '<p style="margin: 20px 0px; white-space: pre; overflow-wrap: break-word; background-color: transparent; color:white;">',
            releasenotes.replace(/\n- /g, '<li>'),
            '</p>',
            'Do you wish to download it now?',
            '<br><label class="btn btn-danger" onclick="localStorage.setItem(\'', settingsKey, '\', 1);"> Don\'t show this notification again for v', result[0].tag_name, '</button>'
          ].join(''))

          dlg.result.then(function(btn) {
            nw.Shell.openExternal(result[0].html_url)
          })
        })
      }
    }
  }
])
;
/*
 * Translation configuration.
 */
DuckieTV

  .constant('availableLanguageKeys', [
    'de_de', 'el_gr', 'en_uk', 'en_us', 'en_za', 'es_es', 'fr_fr', 'it_it', 'ja_jp', 'ko_kr', 'nb_no', 'nl_nl', 'pt_pt', 'ro_ro', 'ru_ru', 'sk_sk', 'sl_si', 'sv_se', 'tr_tr', 'zh_cn'
  ])

  .constant('customLanguageKeyMappings', {
    'au': 'en_uk',
    'ca': 'en_uk',
    'de': 'de_de',
    'de_DE': 'de_de',
    'el_GR': 'el_gr',
    'en': 'en_us',
    'en_AU': 'en_uk',
    'en_au': 'en_uk',
    'en_AU': 'en_uk',
    'en_ca': 'en_uk',
    'en_CA': 'en_uk',
    'en_gb': 'en_uk',
    'en_GB': 'en_uk',
    'en_nz': 'en_uk',
    'en_NZ': 'en_uk',
    'en_UK': 'en_uk',
    'en_US': 'en_us',
    'en_ZA': 'en_za',
    'es': 'es_es',
    'es_ES': 'es_es',
    'fr': 'fr_fr',
    'fr_ca': 'fr_fr',
    'fr_CA': 'fr_fr',
    'fr_FR': 'fr_fr',
    'gb': 'en_uk',
    'it': 'it_it',
    'it_IT': 'it_it',
    'ja': 'ja_jp',
    'ja_JP': 'ja_jp',
    'ko': 'ko_kr',
    'ko_KR': 'ko_kr',
    'nb': 'nb_no',
    'nb_NO': 'nb_no',
    'nl': 'nl_nl',
    'nl_NL': 'nl_nl',
    'nz': 'en_uk',
    'pt': 'pt_pt',
    'pt_br': 'pt_pt',
    'pt_BR': 'pt_pt',
    'pt_PT': 'pt_pt',
    'ro_RO': 'ro_ro',
    'ru': 'ru_ru',
    'ru_RU': 'ru_ru',
    'sk': 'sk_sk',
    'sk_SK': 'sk_sk',
    'si': 'sl_si',
    'sl_SI': 'sl_si',
    'sv': 'sv_se',
    'sv_SE': 'sv_se',
    'tr': 'tr_tr',
    'tr_TR': 'tr_tr',
    'uk': 'en_uk',
    'zh': 'zh_cn',
    'zh_CN': 'zh_cn'
  })

  .config(['$translateProvider', 'availableLanguageKeys', 'customLanguageKeyMappings',
    function($translateProvider, availableLanguageKeys, customLanguageKeyMappings) {
      $translateProvider
        /*
         * Escape all outputs from Angular Translate for security, not that
         * it is really needed in this case but it stops throwing a warning
         */
        .useSanitizeValueStrategy('escaped')

        /*
         * setup path to the translation table files
         * example ../_Locales/en_us.json
         */
        .useStaticFilesLoader({
          prefix: 'locales/',
          suffix: '.json'
        })

        /*
         * help the determinePreferredLanguage module match a find
         * with one of our provided languages
         */
        .registerAvailableLanguageKeys(availableLanguageKeys, customLanguageKeyMappings)

        /*
         * default language
         */
        .preferredLanguage('en_us')

      /*
         * determine the local language
         *
         * Using this method at our own risk! Be aware that each browser can return different values on these properties.
         * It searches for values in the window.navigator object in the following properties (also in this order):
         *
         * navigator.languages[0]
         * navigator.language
         * navigator.browserLanguage
         * navigator.systemLanguage
         * navigator.userLanguage
         *
         * if it becomes problematic, use $translateProvider.preferredLanguage('en_us'); here to set a default
         * or $translate.use('en_us'); in a controller or service.
         */

        .fallbackLanguage('en_us')
        .use('en_us')

        .determinePreferredLanguage()

        // error logging. missing keys are sent to $log
        .useMissingTranslationHandler('duckietvMissingTranslationHandler')
    }
  ])

/*
 * Custom Missing Translation key Handler
 */
  .factory('duckietvMissingTranslationHandler', ['$translate', 'SettingsService',
    function($translate, SettingsService) {
      var previousKeys = [] // list of missing keys we have processed once already
      var appLocale = SettingsService.get('application.locale') // the application language the user wants

      return function(translationID, lang) {
        if (typeof lang === 'undefined') {
          // ignore translation errors until the appLocale's translation table has been loaded
          return translationID
        }
        if (previousKeys.indexOf(lang + translationID) !== -1) {
          // we have had this key already, do nothing
          return translationID
        } else {
          // first time we have had this key, log it
          previousKeys.push(lang + translationID)
          console.warn('Translation for (' + lang + ') key ' + translationID + " doesn't exist")
          return translationID
        }
      }
    }
  ])

  .run(['SettingsService', '$translate', 'datePickerConfig', function(SettingsService, $translate, datePickerConfig) {
    SettingsService.set('client.determinedlocale', $translate.proposedLanguage() === undefined ? 'en_us' : $translate.proposedLanguage().toLowerCase())

    var configuredLocale = SettingsService.get('application.locale') || $translate.proposedLanguage()
    var finalLocale = SettingsService.changeLanguage(configuredLocale.toLowerCase(), $translate.proposedLanguage())

    if (finalLocale != configuredLocale) {
      SettingsService.set('application.locale', finalLocale)
    }
    datePickerConfig.startSunday = SettingsService.get('calendar.startSunday')
  }])
;
DuckieTV.run(['$rootScope', 'SettingsService',
  function($rootScope, SettingsService) {
    /**
     * Window decorations and position storage for DuckieTV standalone.
     * Stores window position in localStorage on app close
     * Restores window position when available in localStorage
     * Auto minimizes app when indicated in localStorage
     * Adds event click handlers to the window decoration items in the DOM.
     */
    if (SettingsService.isStandalone()) {
      var win = nw.Window.get()
      var winState = 'normal'
      var pos, maximize, unmaximize

      if (localStorage.getItem('standalone.position')) {
        pos = JSON.parse(localStorage.getItem('standalone.position'))
        win.resizeTo(parseInt(pos.width), parseInt(pos.height))
        win.moveTo(parseInt(pos.x), parseInt(pos.y))
        // console.debug('state=%s,h=%i,w=%i,x=%i,y=%i',pos.state,pos.height,pos.width,pos.x,pos.y);
        if (pos.state == 'maximized') {
          setTimeout(function() {
            if (localStorage.getItem('standalone.startupMinimized') !== 'Y') {
              win.maximize()
            }
            if (maximize && unmaximize) {
              maximize.style.display = 'none'
              unmaximize.style.display = ''
            }
          }, 230)
          winState = 'maximized'
          $rootScope.$emit('winstate', winState)
        }
      }

      if (localStorage.getItem('standalone.startupMinimized') !== 'Y') {
        setTimeout(function() {
          win.show()
        }, 120)
      }
      window.addEventListener('DOMContentLoaded', function() {
        // add standalone window decorators
        document.body.classList.add('standalone')

        // and handle their events.
        document.getElementById('close').addEventListener('click', function() {
          localStorage.setItem('standalone.position', JSON.stringify({
            width: window.outerWidth,
            height: window.outerHeight,
            x: window.screenX,
            y: window.screenY,
            state: winState

          }))
          win.close() // we call window.close so that the close event can fire
        })

        document.getElementById('minimize').addEventListener('click', function() {
          win.minimize()
        })

        maximize = document.getElementById('maximize')
        unmaximize = document.getElementById('unmaximize')

        // show/hide maximize/unmaximize button on toggle.
        maximize.addEventListener('click', function() {
          maximize.style.display = 'none'
          unmaximize.style.display = ''
          win.maximize()
          winState = 'maximized'
          $rootScope.$emit('winstate', winState)
        })

        unmaximize.addEventListener('click', function() {
          unmaximize.style.display = 'none'
          maximize.style.display = ''
          win.unmaximize()
          winState = 'normal'
          $rootScope.$emit('winstate', winState)
        })
      })
    }
  }])
;
DuckieTV.run(['$rootScope', 'SettingsService',
  function($rootScope, SettingsService) {
    /**
         * nw.js standalone systray
         */
    if (SettingsService.isStandalone()) {
      var tray = null

      var showdtv; var calendar; var favorites; var settings; var about; var exit; var traymenu
      var win = nw.Window.get()
      var alwaysShowTray = (localStorage.getItem('standalone.alwaysShowTray') === 'Y')
      var trayColor = '' // default colour of the tray icon
      if (localStorage.getItem('standalone.trayColor')) {
        trayColor = localStorage.getItem('standalone.trayColor')
      }
      var winState = 'normal'
      if (localStorage.getItem('standalone.position')) {
        var pos = JSON.parse(localStorage.getItem('standalone.position'))
        winState = pos.state
      }

      // debugging
      // console.debug('debugging source version=3');
      // console.debug('standalone.alwaysShowTray=' + localStorage.getItem('standalone.alwaysShowTray'));
      // console.debug('standalone.startupMinimized=' + localStorage.getItem('standalone.startupMinimized'));
      // console.debug('minimizeSystray=' + localStorage.getItem('standalone.minimizeSystray'));
      // console.debug('closeSystray=' + localStorage.getItem('standalone.closeSystray'));

      // Create the menu, only needs to be made once
      traymenu = new nw.Menu()
      // Add a show button
      showdtv = new nw.MenuItem({
        label: 'Show DuckieTV',
        click: function() {
          // console.debug('menu showdtv: emit.restoredtv');
          $rootScope.$emit('restoredtv')
        }
      })
      traymenu.append(showdtv)

      // Add a ADLStatus button
      adlstatus = new nw.MenuItem({
        label: 'Show ADLStatus',
        enabled: (SettingsService.get('torrenting.enabled') && SettingsService.get('torrenting.autodownload')),
        click: function() {
          $rootScope.$emit('standalone.adlstatus')
          // console.debug('menu adlstatus: emit.restoredtv');
          $rootScope.$emit('restoredtv')
        }
      })
      traymenu.append(adlstatus)

      // Add a calendar button
      calendar = new nw.MenuItem({
        label: 'Show Calendar',
        click: function() {
          $rootScope.$emit('standalone.calendar')
          // console.debug('menu calendar: emit.restoredtv');
          $rootScope.$emit('restoredtv')
        }
      })
      traymenu.append(calendar)

      // Add a favorites button
      favorites = new nw.MenuItem({
        label: 'Show Favorites',
        click: function() {
          $rootScope.$emit('standalone.favorites')
          // console.debug('menu favorites: emit.restoredtv');
          $rootScope.$emit('restoredtv')
        }
      })
      traymenu.append(favorites)

      // Add a settings button
      settings = new nw.MenuItem({
        label: 'Show Settings',
        click: function() {
          $rootScope.$emit('standalone.settings')
          // console.debug('menu settings: emit.restoredtv');
          $rootScope.$emit('restoredtv')
        }
      })
      traymenu.append(settings)

      // Add a about button
      about = new nw.MenuItem({
        label: 'Show About',
        click: function() {
          $rootScope.$emit('standalone.about')
          // console.debug('menu about: emit.restoredtv');
          $rootScope.$emit('restoredtv')
        }
      })
      traymenu.append(about)

      // Add a separator
      traymenu.append(new nw.MenuItem({
        type: 'separator'
      }))
        // Add a devtools button
        var devtools = new nw.MenuItem({
            label: "Open DevTools",
            click: function() {
                //console.debug('menu devtools');
                win.showDevTools();
            }
        });
        traymenu.append(devtools);
        // Add a reload button
        var devreload = new nw.MenuItem({
            label: "Reload",
            click: function() {
                //console.debug('menu reload');
                window.location.reload();
            }
        });
        traymenu.append(devreload);

      // Add a exit button
      exit = new nw.MenuItem({
        label: 'Exit',
        click: function() {
          // win.close(true);
          nw.App.quit()
        },
        key: 'q',
        modifiers: 'cmd'
      })
      traymenu.append(exit)
      // console.debug('menu created');

      // Remakes/Creates the tray as once a tray is removed it needs to be remade.
      var createTray = function() {
        if (tray !== null) {
          // tray exists, do nothing
          // console.debug('createTray: tray exists id=',tray.id);
          return true
        }
        tray = new nw.Tray({
          icon: 'img/logo/icon64' + trayColor + '.png'
        })
        // console.debug('createTray: tray created id=',tray.id);
        tray.on('click', function() {
          // console.debug('tray.on click: emit.restoredtv');
          $rootScope.$emit('restoredtv')
        })

        tray.tooltip = "DuckieTV"
        // tray.tooltip = 'id='+tray.id;
        tray.menu = traymenu
      }

      // If we're always showing the tray, create it now (default is N or null)
      if (localStorage.getItem('standalone.alwaysShowTray') === 'Y') {
        // console.debug('alwaysShowTray');
        createTray()
      }

      // create tray if are we going to minimize after start-up (default is N or null)
      if (localStorage.getItem('standalone.startupMinimized') === 'Y') {
        // console.debug('startupMinimized');
        // Create a new tray if one isn't already
        createTray()
      }

      // On Minimize Event
      win.on('minimize', function() {
        // Should we minimize to systray or taskbar? (default is N or null)
        // console.debug('on minimize');
        if (localStorage.getItem('standalone.minimizeSystray') === 'Y') {
          // console.debug('on minimize: minimizeSystray');
          // Hide window
          win.hide()
          // Create a new tray if one isn't already
          createTray()
        }
      })

      // On Restore Event
      $rootScope.$on('restoredtv', function() {
        // console.debug('on restoredtv');
        win.show()
        // If we're not always showing tray, remove it
        if (tray !== null && !alwaysShowTray) {
          // console.debug('on restoredtv: tray.remove id=',tray.id);
          tray.remove()
          tray = null
        }
        if (winState == 'maximized') {
          setTimeout(function() {
            win.maximize()
          }, 150)
        }
      })

      // On Close Event, fired before anything happens
      win.on('close', function() {
        // does close mean go to systray? (default N or null)
        if (localStorage.getItem('standalone.closeSystray') === 'Y') {
          // console.debug('closeSystray');
          // Hide window
          win.hide()
          // Create a new tray if one isn't already
          createTray()
        } else {
          // win.close(true);
          nw.App.quit()
        }
      })

      // on winstate event, update winState
      $rootScope.$on('winstate', function(winstate) {
        // console.debug('winState=',winstate);
        winState = winstate
      })

      // on locationreload event, delete tray and listeners.
      // swap out normal window.location.reload function for a wrapper that does this for ease of use.
      window.location._reload = window.location.reload

      function removeTray() {
        if (tray !== null) {
          // console.debug('on locationreload: tray.remove id=',tray.id);
          tray.remove()
          tray = null
        }
        win.removeAllListeners()
        // console.debug('on locationreload: window.location.reload()');
      }

      window.location.reload = function() {
        console.warn('Reloading!!')
        removeTray()
        window.location._reload()
      }

      window.addEventListener('unload', function() {
        removeTray()
      }, false)
    }

    // Only fires if force close is false
    /* Prototype
            win.on('close', function() {

                win.showDevTools();

                var queryStats = CRUD.stats;

                /**
                 * When closing DuckieTV we don't currently check if there is any ongoing database operations
                 * It is possible to check as CRUD is global and we can continue to run the db updates in background
                 * until finished and then properly close the app.
                 * One issue however is that CRUDs 'writesQueued' isn't the correct number, more db operations can
                 * be added after it finishes which leaves like 1ms where 'Can close safely' function will fire incorrectly.
                 */
    /*
                if (queryStats.writesExecuted < queryStats.writesQueued) {
                    Object.observe(CRUD.stats, function() {
                        queryStats = CRUD.stats;
                        if (queryStats.writesExecuted < queryStats.writesQueued) {
                            console.log("Database operations still ongoing!");
                        } else {
                            console.log("Can close safely, win.close(true) in console to close");
                        }
                    });
                } else {
                    console.log("We can close safely, win.close(true) in console to close");
                }
            }); */
  }
])
;
DuckieTV.run(['$rootScope', 'SettingsService',
  function($rootScope, SettingsService) {
    /**
     * Chrome compatible zoom keyboard control implementation for nw.js
     * Zoomlevel is stored in localStorage because this code runs early.
     * Also attaches DevTools F12 key handler
     */
    if (SettingsService.isStandalone()) {
      var win = nw.Window.get()

      var zoomLevels = [25, 33, 50, 67, 75, 90, 100, 110, 125, 150, 175, 200, 250, 300, 400, 500]

      var zoomIndex = 'standalone.zoomlevel' in localStorage ? parseInt(localStorage.getItem('standalone.zoomlevel')) : 6

      var setZoomLevel = function(index) {
        if (index < 0) {
          index = 0
        }
        if (index > 15) {
          index = 15
        }
        zoomIndex = index
        win.zoomLevel = Math.log(zoomLevels[index] / 100) / Math.log(1.2)
        localStorage.setItem('standalone.zoomlevel', zoomIndex)
      }

      setZoomLevel(zoomIndex)

      // get the zoom command events
      window.addEventListener('keydown', function(event) {
        switch (event.keyCode) {
          case 123: // F12, show inspector
            win.showDevTools()
            break
          case 187: // +
            if (event.ctrlKey) {
              setZoomLevel(zoomIndex + 1)
            }
            break
          case 189: // -
            if (event.ctrlKey) {
              setZoomLevel(zoomIndex - 1)
            }
            break
          case 48: // 0
            if (event.ctrlKey) {
              setZoomLevel(6)
            }
            break
        }
      })
    }
  }])
;
/**
 * controller for the autoBackup dialogue
 */
DuckieTV.controller('backupDialogCtrl', ['$scope', '$uibModalInstance', '$filter', 'BackupService',
  function($scope, $modalInstance, $filter, BackupService) {
    $scope.cancel = function() {
      $modalInstance.dismiss('Canceled')
    }

    /**
     * Create backup via download service and force the download.
     */
    $scope.createBackup = function() {
      BackupService.createBackup().then(function(backupString) {
        var filename = 'DuckieTV %s.backup'.replace('%s', $filter('date')(new Date(), 'shortDate'))
        download(backupString, filename, 'application/json')
      })

      $modalInstance.dismiss('Canceled')
      localStorage.setItem('autobackup.lastrun', new Date().getTime())
    }
  }
])
;
DuckieTV.controller('localSeriesCtrl', ['$rootScope', 'FavoritesService', 'SeriesMetaTranslations',
  function($rootScope, FavoritesService, SeriesMetaTranslations) {
    var vm = this

    // Broadcast empty filter to reset the value in the SeriesList Ctrl
    $rootScope.$broadcast('serieslist:filter', '')
    $rootScope.$broadcast('serieslist:genreFilter', '')
    $rootScope.$broadcast('serieslist:statusFilter', '')

    vm.genreList = {}
    vm.statusList = {}
    vm.selectedGenres = []
    vm.selectedStatus = []
    vm.translateGenre = SeriesMetaTranslations.translateGenre
    vm.translateStatus = SeriesMetaTranslations.translateStatus

    // Populates what genres and status exist for our library and how many of each
    FavoritesService.favorites.map(function(serie) {
      if (serie.status !== '') {
        if (!(serie.status in vm.statusList)) {
          vm.statusList[serie.status] = 0
        }

        vm.statusList[serie.status]++
      }

      serie.genre.split('|').map(function(genre) {
        if (genre.length === 0) {
          return
        }

        if (!(genre in vm.genreList)) {
          vm.genreList[genre] = 0
        }

        vm.genreList[genre]++
      }, vm)
    }, vm)

    // Tells the filter control what to filter, updates 300ms after input
    vm.setFilter = function(val) {
      $rootScope.$broadcast('serieslist:filter', val)
      $rootScope.$applyAsync()
    }

    // Selects a genre
    vm.selectGenre = function(genre) {
      if (vm.selectedGenres.indexOf(genre) === -1) {
        vm.selectedGenres.push(genre)
      } else {
        vm.selectedGenres.splice(vm.selectedGenres.indexOf(genre), 1)
      }

      $rootScope.$broadcast('serieslist:genreFilter', vm.selectedGenres)
    }

    // Selects a status
    vm.selectStatus = function(status) {
      if (vm.selectedStatus.indexOf(status) === -1) {
        vm.selectedStatus.push(status)
      } else {
        vm.selectedStatus.splice(vm.selectedStatus.indexOf(status), 1)
      }

      $rootScope.$broadcast('serieslist:statusFilter', vm.selectedStatus)
    }

    // Returns if the genre is selected
    vm.getCheckedGenre = function(genre) {
      return vm.selectedGenres.indexOf(genre) > -1
    }

    // Returns if the status is selected
    vm.getCheckedStatus = function(status) {
      return vm.selectedStatus.indexOf(status) > -1
    }
  }
])
;
DuckieTV.controller('seriesListCtrl', ['FavoritesService', '$rootScope', 'SettingsService', 'SidePanelState', '$state', '$filter', 'FavoritesManager',
  function(FavoritesService, $rootScope, SettingsService, SidePanelState, $state, $filter, FavoritesManager) {
    var vm = this

    FavoritesService.flushAdding() // flush the adding and error status list

    vm.activated = true
    vm.isSmall = SettingsService.get('library.smallposters') // library posters size , true for small, false for large
    vm.sgEnabled = SettingsService.get('library.seriesgrid')
    vm.watchedDownloadedPaired = SettingsService.get('episode.watched-downloaded.pairing')
    vm.orderByList = ['getSortName()', 'added', 'firstaired', 'notWatchedCount']
    vm.orderReverseResetList = [true, false, true, true]
    vm.orderReverseList = SettingsService.get('library.order.reverseList') // default [true, false, true, true]
    vm.orderBy = SettingsService.get('library.order.by') // default 'getSortName()'
    vm.reverse = !vm.orderReverseList[vm.orderByList.indexOf(vm.orderBy)] // default false;
    vm.translatedOrderByList = $filter('translate')('ORDERBYLIST').split('|')
    vm.query = '' // local filter query, set from LocalSerieCtrl
    vm.genreFilter = [] // genre filter from localseriectrl
    vm.statusFilter = []
    vm.isFiltering = true

    /**
     * Context Menu that appears when right clicking on series
     * * Mark all watched/unwatched
     * * --
     * * Hide/Show series on calendar
     * * Remove from Favorites
     **/
    vm.contextMenu = function(serie) {
      return [
        [ // Mark all watched
          $filter('translate')('COMMON/mark-all-watched/lbl'),
          function() {
            serie.markSerieAsWatched(vm.watchedDownloadedPaired, $rootScope).then(function() {
              $rootScope.$broadcast('serie:recount:watched', serie.ID_Serie)
            })
          },
          function() {
            return +serie.notWatchedCount !== 0
          }
        ],
        [ // Mark all downloaded
          $filter('translate')('COMMON/mark-all-downloaded/lbl'),
          function() {
            serie.markSerieAsDownloaded($rootScope)
          }
        ],
        null, // Divider
        [ // Toggle Calendar Display Option
          +serie.displaycalendar === 1
            ? $filter('translate')('COMMON/calendar-hide/btn')
            : $filter('translate')('COMMON/calendar-show/btn'),
          function() {
            serie.toggleCalendarDisplay()
          }
        ],
        [ // Remove Serie option, pops up confirmation.
          $filter('translate')('COMMON/delete-serie/btn'),
          function() {
            FavoritesManager.remove(serie)
          }
        ]
      ]
    }

    // Changes the order of the series list and saves it
    vm.setOrderBy = function(orderBy, evt) {
      evt.stopPropagation()
      var idx = vm.orderByList.indexOf(orderBy)
      vm.reverse = vm.orderReverseList[idx]
      vm.orderReverseList = vm.orderReverseResetList.slice()
      vm.orderReverseList[idx] = !vm.reverse
      vm.orderBy = orderBy
      SettingsService.set('library.order.by', vm.orderBy)
      SettingsService.set('library.order.reverseList', vm.orderReverseList)
    }

    // Takes the English orderBy (elements from Series table) and returns a translation
    vm.translateOrderBy = function(orderBy) {
      var idx = vm.orderByList.indexOf(orderBy)
      return (idx !== -1) ? vm.translatedOrderByList[idx] : vm.translatedOrderByList[0]
    }

    vm.toggleFiltering = function() {
      vm.isFiltering = !vm.isFiltering
      vm.query = ''
    }

    $rootScope.$on('serieslist:filter', function(evt, query) {
      vm.query = query
    })

    $rootScope.$on('serieslist:genreFilter', function(evt, genres) {
      vm.genreFilter = genres
    })

    $rootScope.$on('serieslist:statusFilter', function(evt, status) {
      vm.statusFilter = status
    })

    vm.localFilter = function(el) {
      var nameMatch = true

      var statusMatch = true

      var genreMatch = true
      if (vm.query.length > 0) {
        nameMatch = el.name.toLowerCase().indexOf(vm.query.toLowerCase()) > -1
      }

      if (vm.statusFilter.length > 0) {
        statusMatch = vm.statusFilter.indexOf(el.status) > -1
      }

      if (vm.genreFilter.length > 0) {
        var matched = false
        vm.genreFilter.map(function(genre) {
          if (el.genre.indexOf(genre) > -1) {
            matched = true
          }
        })

        genreMatch = matched
      }

      return nameMatch && statusMatch && genreMatch
    }

    // Automatically launch the first search result when user hits enter in the filter form
    vm.execFilter = function() {
      var el = document.querySelector('.series serieheader a')

      if (el) {
        el.click()
      }
    }

    // Fires when user hits enter in the search box when adding a series - selects the first result and opens details subpanel.
    vm.selectFirstResult = function() {
      var el = document.querySelector('serieheader')

      if (el) {
        el.click()
      }
    }

    vm.getFavorites = function() {
      return FavoritesService.favorites
    }

    // Closes the trakt-serie-details sidepanel when exiting adding mode
    vm.closeSidePanel = function() {
      SidePanelState.hide()
    }

    // Toggles small mode on off
    vm.toggleSmall = function() {
      vm.isSmall = !vm.isSmall
      SettingsService.set('library.smallposters', vm.isSmall)
    }

    // Toggle or untoggle the favorites panel
    vm.activate = function() {
      vm.activated = true
    }

    // Close the drawer
    vm.closeDrawer = function() {
      vm.activated = false
      document.body.style.overflowY = 'auto'
    }

    /**
     * Add a show to favorites.
     * The serie object is a Trakt.TV TV Show Object.
     * Queues up the trakt_id in the serieslist.adding array so that the spinner can be shown.
     * Then adds it to the favorites list and when that 's done, toggles the adding flag to false so that
     * It can show the checkmark.
     */
    vm.selectSerie = function(serie) {
      FavoritesManager.add(serie).then(function() {
        $state.go('serie', {
          id: FavoritesService.getByTRAKT_ID(serie.trakt_id).ID_Serie
        })
      })
    }

    /**
     * Verify with the favoritesservice if a specific trakt_id is registered.
     * Used to show checkmarks in the add modes for series that you already have.
     */
    vm.isAdded = function(trakt_id) {
      return FavoritesService.isAdded(trakt_id)
    }

    // Returns true as long as the add a show to favorites promise is running.
    vm.isAdding = function(trakt_id) {
      return FavoritesService.isAdding(trakt_id)
    }

    // Returns true as long as the add a show to favorites promise is running.
    vm.isError = function(trakt_id) {
      return FavoritesService.isError(trakt_id)
    }
  }
])
;
DuckieTV.controller('traktTvSearchCtrl', ['$rootScope', 'TraktTVv2', '$stateParams',
  function($rootScope, TraktTVv2, $stateParams) {
    var vm = this

    vm.results = []
    vm.searching = true
    vm.error = false
    vm.search = {
      query: ''
    }

    TraktTVv2.search($stateParams.query).then(function(res) {
      vm.search.query = $stateParams.query
      vm.error = false
      vm.searching = false
      vm.results = res || []
      $rootScope.$applyAsync()
    }).catch(function(err) {
      console.error('Search error!', err)
      vm.error = err
      vm.searching = false
      vm.results = []
    })
  }
])
;
DuckieTV.controller('traktTvTrendingCtrl', ['TraktTVTrending', 'FavoritesService', 'SeriesMetaTranslations',
  function(TraktTVTrending, FavoritesService, SeriesMetaTranslations) {
    var vm = this

    vm.results = []
    vm.filtered = []
    vm.limit = 75
    vm.oldLimit = 75
    vm.activeCategory = false
    vm.translateCategory = SeriesMetaTranslations.translateGenre

    FavoritesService.waitForInitialization().then(function() {
      if (FavoritesService.favorites.length === 0) {
        vm.noFavs = true
      }
    })

    // enables excluding series already in favourites from trending results
    var alreadyAddedSerieFilter = function(serie) {
      return FavoritesService.favoriteIDs.indexOf(serie.trakt_id.toString()) === -1
    }

    vm.getCategories = function() {
      return TraktTVTrending.getCategories()
    }

    vm.toggleCategory = function(category) {
      if (!category || vm.activeCategory === category) {
        vm.activeCategory = false
        vm.limit = vm.oldLimit

        TraktTVTrending.getAll().then(function(result) {
          vm.filtered = result.filter(alreadyAddedSerieFilter)
        })
      } else {
        vm.activeCategory = category
        vm.filtered = TraktTVTrending.getByCategory(category).filter(alreadyAddedSerieFilter)
        vm.limit = vm.filtered.length
      }
    }

    vm.getFilteredResults = function() {
      return vm.filtered
    }

    TraktTVTrending.getAll().then(function(results) {
      vm.filtered = results.filter(alreadyAddedSerieFilter)
    })
  }
])
;
/**
 * Handles creating and importing a backup.
 *
 * see app.js for the backup format structure description
 */
DuckieTV.controller('BackupCtrl', ['$rootScope', '$scope', '$filter', 'BackupService', 'dialogs', 'FileReader', 'TraktTVv2', 'SettingsService', 'FavoritesService', 'CalendarEvents', 'TorrentSearchEngines',
  function($rootScope, $scope, $filter, BackupService, dialogs, FileReader, TraktTVv2, SettingsService, FavoritesService, CalendarEvents, TorrentSearchEngines) {
    $scope.wipeBeforeImport = false
    $scope.declined = false
    $scope.completed = false
    $scope.series = []
    var backupCount = 0
    var completedCount = 0
    var useTrakt_id = false
    var TRAKTorTVDB_LBL = 'TVDB_ID'

    // set up the auto-backup-period selection-options
    var translatedAutoBackupPeriodList = $filter('translate')('AUTOBACKUPLIST').split('|')
    var englishAutoBackupPeriodList = 'never|daily|weekly|monthly'.split('|')
    $scope.autoBackupPeriod = SettingsService.get('autobackup.period')
    $scope.autoBackupSelect = []
    for (var idx = 0; idx < englishAutoBackupPeriodList.length; idx++) {
      $scope.autoBackupSelect.push({
        'name': translatedAutoBackupPeriodList[idx],
        'value': englishAutoBackupPeriodList[idx]
      })
    }
    $scope.nextAutoBackupDate = ''
    // determine next run time
    var lastRun = new Date(parseInt(localStorage.getItem('autobackup.lastrun')))
    var nextBackupDT = null
    switch ($scope.autoBackupPeriod) {
      case 'daily':
        nextBackupDT = new Date(lastRun.getFullYear(), lastRun.getMonth(), lastRun.getDate() + 1, lastRun.getHours(), lastRun.getMinutes(), lastRun.getSeconds()).getTime()
        $scope.nextAutoBackupDate = '' + new Date(parseInt(nextBackupDT))
        break
      case 'weekly':
        nextBackupDT = new Date(lastRun.getFullYear(), lastRun.getMonth(), lastRun.getDate() + 7, lastRun.getHours(), lastRun.getMinutes(), lastRun.getSeconds()).getTime()
        $scope.nextAutoBackupDate = '' + new Date(parseInt(nextBackupDT))
        break
      case 'monthly':
        nextBackupDT = new Date(lastRun.getFullYear(), lastRun.getMonth() + 1, lastRun.getDate(), lastRun.getHours(), lastRun.getMinutes(), lastRun.getSeconds()).getTime()
        $scope.nextAutoBackupDate = '' + new Date(parseInt(nextBackupDT))
        break
      default:
    }

    /**
     * Create backup via download service and force the download.
     */
    $scope.createBackup = function() {
      BackupService.createBackup().then(function(backupString) {
        var filename = 'DuckieTV %s.backup'.replace('%s', $filter('date')(new Date(), 'shortDate'))
        download(backupString, filename, 'application/json')
      })
    }

    $scope.isAdded = function(TRAKTorTVDB_ID) {
      return FavoritesService.isAdded(TRAKTorTVDB_ID)
    }

    $scope.isAdding = function(TRAKTorTVDB_ID) {
      return FavoritesService.isAdding(TRAKTorTVDB_ID)
    }

    $scope.restore = function() {
      console.log('Import backup!', $scope)
      FavoritesService.flushAdding()
      $scope.series = []
      if ($scope.wipeBeforeImport) {
        $scope.wipeDatabase('restore')
      } else {
        importBackup()
      }
    }

    /**
     * Read the backup file and feed it to the FavoritesService to resolve and add.
     * The FavoritesService has a method to automagically import the watched episodes
     * (which is a bit hacky as it should be part of the import)
     */
    var importBackup = function() {
      var torrentingEnabled = SettingsService.get('torrenting.enabled') // remember current torrenting setting
      FileReader.readAsText($scope.file, $scope)
        .then(function(result) {
          result = angular.fromJson(result)
          console.log('Backup read!', result)

          // save settings
          angular.forEach(result.settings, function(value, key) {
            if (key === 'utorrent.token') return // skip utorrent auth token since it can be invalid.
            if (key === 'useTrakt_id') {
              // flag indicating series id is a trakt_id and not a tvdb_id (included in versions after 1.1.5)
              useTrakt_id = true
              TRAKTorTVDB_LBL = 'TRAKT_ID'
              return // skip since this is not a localStorage key.
            }

            /*
            * process psuedo localStorage _jackett_ in backup's _settings_
            */
            if (key === 'jackett') {
              var importedJackett = JSON.parse(value)
              var fillJackett = function(jackett, data) {
                jackett.name = data.name
                jackett.torznab = data.torznab
                jackett.enabled = data.enabled
                jackett.torznabEnabled = data.torznabEnabled
                jackett.apiKey = data.apiKey
                jackett.json = data.json
              }

              importedJackett.map(function(data) {
                var jackett = TorrentSearchEngines.getJackettFromCache(data.name) || new Jackett()
                fillJackett(jackett, data)
                jackett.Persist().then(function() {
                  TorrentSearchEngines.removeJackettFromCache(jackett.name)
                  TorrentSearchEngines.addJackettEngine(jackett)
                })
              })

              return
            }

            localStorage.setItem(key, value)
          })

          SettingsService.restore()
          // schedule the next auto-backup after the import in a days time.
          var localDT = new Date()
          var nextBackupDT = new Date(localDT.getFullYear(), localDT.getMonth(), localDT.getDate() + 1, localDT.getHours(), localDT.getMinutes(), localDT.getSeconds()).getTime()
          localStorage.setItem('autobackup.lastrun', nextBackupDT)

          // adjust other settings
          SettingsService.set('autodownload.lastrun', new Date().getTime())
          SettingsService.set('torrenting.enabled', torrentingEnabled) // restore torrenting setting to value prior to restore

          // save series/seasons/episodes
          angular.forEach(result.series, function(data, TRAKTorTVDB_ID) {
            FavoritesService.adding(TRAKTorTVDB_ID)
            backupCount++
            return TraktTVv2.resolveID(TRAKTorTVDB_ID, useTrakt_id).then(function(searchResult) {
              return TraktTVv2.serie(searchResult.trakt_id)
            }).then(function(serie) {
              $scope.series.push(serie)
              return FavoritesService.addFavorite(serie, data)
            }).then(function() {
              // save series custom settings
              var filters = { [TRAKTorTVDB_LBL]: TRAKTorTVDB_ID }
              CRUD.FindOne('Serie', filters).then(function(serie) {
                if (!serie) {
                  console.warn('Series by %s %s not found.', TRAKTorTVDB_LBL, TRAKTorTVDB_ID)
                } else {
                  // are we dealing with a pre-1.1.4 backup?
                  if (data.length > 0) {
                    if ('TVDB_ID' in data[0]) {
                      // this is a pre 1.1.4 backup, skip it
                    } else {
                      // this is a 1.1.4 or newer backup, process the series custom settings
                      serie = angular.extend(serie, data[0])
                      serie.Persist()
                    }
                  }
                }
              })
              FavoritesService.added(TRAKTorTVDB_ID)
              completedCount++
              $scope.completed = (backupCount === completedCount)
            })
          }, function(err) {
            console.error('ERROR!', err)
            completedCount++
          })
        })
    }

    /**
     * Wipes the database of all series, seasons and episodes and removes all settings
     */
    $scope.wipeDatabase = function(isRestoring) {
      if (!isRestoring) {
        isRestoring = 'N'
      }
      var dlg = dialogs.confirm($filter('translate')('COMMON/wipe/hdr'),
        $filter('translate')('BACKUPCTRLjs/wipe/desc')
      )
      dlg.result.then(function(btn) {
        var db = CRUD.EntityManager.getAdapter().db
        for (var i in localStorage) {
          if (i.indexOf('database.version') == 0) continue
          if (i.indexOf('utorrent.token') == 0) continue
          localStorage.removeItem(i)
        }
        FavoritesService.favorites = []
        FavoritesService.favoriteIDs = []
        FavoritesService.flushAdding()
        CalendarEvents.clearCache()

        return Promise.all(['Series', 'Seasons', 'Episodes', 'Jackett'].map(function(table) {
          return db.execute('DELETE from ' + table + ' where 1').then(function(result) {
            console.log('Database Deleted')
            return true
          })
        })).then(function() {
          if (isRestoring == 'N') {
            window.location.reload()
          } else {
            importBackup()
          }
        })
      }, function(btn) {
        $scope.declined = true
      })
    }

    $scope.refreshDatabase = async function() {
      $scope.refreshingDatabase = true
      $scope.refreshingDatabaseDone = false
      $scope.totalSeries = FavoritesService.favorites.length
      $scope.seriesCompleted = 0
      $rootScope.$broadcast('queryMonitor:update', {
        type: 'start',
        payload: { total: $scope.totalSeries, current: 0 }
      })

      for (var serie of FavoritesService.favorites) {
        try {
          $scope.processingSerie = serie.name
          console.log('[RefreshDataBase] [' + $scope.seriesCompleted + '/' + $scope.totalSeries + ']', 'updating', $scope.processingSerie)
          var newSerie = await TraktTVv2.serie(serie.TRAKT_ID)
          await FavoritesService.addFavorite(newSerie, undefined, true, true)

          $scope.seriesCompleted++
          $rootScope.$broadcast('queryMonitor:update', {
            type: 'progress',
            payload: { total: $scope.totalSeries, current: $scope.seriesCompleted, name: $scope.processingSerie }
          })
        } catch (err) {
          console.error('Error refreshing serie', serie.name, err)
        }
      }

      $rootScope.$broadcast('storage:update')
      $scope.refreshingDatabaseDone = true
      $rootScope.$broadcast('queryMonitor:update', {
        type: 'finish',
        payload: { total: $scope.totalSeries, current: $scope.seriesCompleted + 1 }
      })
    }

    // save the auto-backup-period setting when changed via the autoBackupForm.
    $scope.$watch('autoBackupPeriod', function(newVal, oldVal) {
      if (newVal == oldVal) return
      SettingsService.set('autobackup.period', newVal)
      window.location.reload()
    })
  }
])
;
/*
 * Controller for the calendar settings tab
 */
DuckieTV.controller('CalendarCtrl', ['$scope', 'SettingsService',
  function($scope, SettingsService) {
    $scope.showSpecials = SettingsService.get('calendar.show-specials')
    $scope.startSunday = SettingsService.get('calendar.startSunday')
    $scope.displayMode = SettingsService.get('calendar.mode')
    $scope.showDownloaded = SettingsService.get('calendar.show-downloaded')
    $scope.showEpisodeNumbers = SettingsService.get('calendar.show-episode-numbers')

    // Toggle if calendar shows specials or not
    $scope.toggleSpecials = function() {
      $scope.showSpecials = !$scope.showSpecials
      SettingsService.set('calendar.show-specials', $scope.showSpecials)
      window.location.reload()
    }

    // Toggles calendar starting on Sunday or Monday
    $scope.toggleCalendarStartDay = function() {
      $scope.startSunday = !$scope.startSunday
      SettingsService.set('calendar.startSunday', $scope.startSunday)
      window.location.reload()
    }

    // Toggles calendar view mode, week or month
    $scope.toggleCalendarDisplayMode = function() {
      $scope.displayMode = $scope.displayMode == 'date' ? 'week' : 'date'
      SettingsService.set('calendar.mode', $scope.displayMode)
      window.location.reload()
    }

    // Toggles whether downloaded episodes are highlighted on the Calendar
    $scope.toggleDownloaded = function() {
      $scope.showDownloaded = !$scope.showDownloaded
      SettingsService.set('calendar.show-downloaded', $scope.showDownloaded)
    }

    // Toggles whether event titles should include the season and episode numbers on the Calendar
    $scope.toggleEpisodeNumbers = function() {
      $scope.showEpisodeNumbers = !$scope.showEpisodeNumbers
      SettingsService.set('calendar.show-episode-numbers', $scope.showEpisodeNumbers)
    }
  }
])
;
DuckieTV.controller('jackettSearchEngineCtrl', ['$http', 'TorrentSearchEngines', 'dialogs',
  function($http, TorrentSearchEngines, dialogs) {
    var vm = this

    // load the default engines
    vm.nativeEngines = TorrentSearchEngines.getNativeEngines()

    // load the jackett engines
    vm.jackettEngines = TorrentSearchEngines.getJackettEngines()

    // delete a jackett SE
    vm.remove = function(engine) {
      TorrentSearchEngines.removeJackettEngine(engine)
      vm.jackettEngines = TorrentSearchEngines.getJackettEngines()
    }

    // is the test button available?
    vm.isTestDisabled = function(engine) {
      return engine.config.useTorznab
    }

    // test jackett SE (using jackett admin test api)
    vm.test = function(engine) {
      vm.jackettEngines[engine.config.name].testing = true
      $http.post(engine.config.test, {'indexer': engine.config.tracker}, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'cache': false
        }
      }).then(function(result) {
        vm.jackettEngines[engine.config.name].testing = false
        if (result.data.result == 'success' || result.status == 204) { // api2 currently returns 204 for tests
          vm.jackettEngines[engine.config.name].testOK = true
          vm.jackettEngines[engine.config.name].testMessage = 'success'
        } else {
          vm.jackettEngines[engine.config.name].testOK = false
          vm.jackettEngines[engine.config.name].testMessage = (result.data.error) ? result.data.error : 'Error, unknown reason.'
        }
      }, function(err) {
        vm.jackettEngines[engine.config.name].testOK = false
        if (err.status == -1) {
          vm.jackettEngines[engine.config.name].testMessage = ['Status:', err.status, 'Reason:', 'Unknown, probably the Jackett Service or App is not active.'].join(' ')
        } else {
          vm.jackettEngines[engine.config.name].testMessage = ['Status:', err.status, 'Reason:', err.statusText || 'Error, unknown reason.'].join(' ')
        }
        vm.jackettEngines[engine.config.name].testing = false
      })
    }

    // disable either a jackett or native SE
    vm.disable = function(engine) {
      TorrentSearchEngines.disableSearchEngine(engine)
    }

    // enable either a jackett or native SE
    vm.enable = function(engine) {
      TorrentSearchEngines.enableSearchEngine(engine)
    }

    // open a dialogue to add (or update) a jackett DB entity
    vm.openDialog = function(jackett, addNew) {
      dialogs.create('templates/dialogs/jackettSearchEngine.html', 'jackettSearchEngineDialogCtrl as jse', {
        engine: jackett,
        isNew: addNew
      }, {
        size: 'lg'
      })
    }

    // is this the default SE ?
    vm.isDefault = function(engineName) {
      return (engineName === TorrentSearchEngines.getDefaultEngineName())
    }
  }
])

DuckieTV.controller('jackettSearchEngineDialogCtrl', ['$scope', '$uibModalInstance', 'data', 'TorrentSearchEngines', 'FormlyLoader',
  function($scope, $modalInstance, data, TorrentSearchEngines, FormlyLoader) {
    var vm = this
    vm.jackett = new Jackett()
    vm.isNew = data.isNew == 1

    if (data.engine && !data.isNew) {
      vm.jackett = TorrentSearchEngines.getJackettFromCache(data.engine.config.name)
    }

    FormlyLoader.load('JackettSearchEngine').then(function(form) {
      vm.model = vm.jackett
      // turn integer into boolean for check-box
      vm.model.torznabEnabled = vm.model.torznabEnabled == 1
      vm.model.isNew = vm.isNew
      vm.fields = form
    })

    vm.save = function() {
      vm.model.enabled = vm.model.enabled ? 1 : 0
      var apiVersion = 1
      if (vm.model.torznab.indexOf('/api/v2.') > -1) {
        apiVersion = 2
      }

      var config
      if (apiVersion == 1) {
        config = {
          'isJackett': true,
          'apiVersion': apiVersion,
          'mirror': vm.model.torznab.substr(0, vm.model.torznab.indexOf('torznab')) + 'Admin/search',
          'name': vm.model.name,
          'test': vm.model.torznab.substr(0, vm.model.torznab.indexOf('torznab')) + 'Admin/test_indexer',
          'torznab': vm.model.torznab + '/api?t=search&cat=&apikey=' + vm.model.apiKey + '&q=',
          'tracker': vm.model.torznab.substr(vm.model.torznab.indexOf('torznab') + 8),
          'useTorznab': !!(vm.model.torznabEnabled)
        }
      } else {
        // API 2
        config = {
          'isJackett': true,
          'apiVersion': apiVersion,
          'apiKey': vm.model.apiKey,
          'mirror': vm.model.torznab.replace(vm.model.torznab.substr(vm.model.torznab.indexOf('/indexers/') + 10), 'all') + '/results',
          'name': vm.model.name,
          'test': vm.model.torznab.replace('/results/torznab/', '/test'),
          'torznab': vm.model.torznab,
          'tracker': vm.model.torznab.substr(vm.model.torznab.indexOf('/indexers/') + 10).replace('/results/torznab/', ''),
          'useTorznab': !!(vm.model.torznabEnabled)
        }
      }

      vm.model.json = JSON.stringify(config)
      vm.model.torznabEnabled = vm.model.torznabEnabled ? 1 : 0 // turn check-box boolean back into integer
      vm.model.Persist().then(function() {
        TorrentSearchEngines.removeJackettFromCache(vm.model.name)
        TorrentSearchEngines.addJackettEngine(vm.model)
        vm.jackettEngines = TorrentSearchEngines.getJackettEngines()
        $modalInstance.close()
        $scope.$destroy()
      })
    }

    vm.cancel = function() {
      $modalInstance.close()
      $scope.$destroy()
    }
  }
])
;
/**
 * DisplayCtrl containing the controller for the Display Settings and Language Settings
 *
 * Controller for the display settings tab
 */
DuckieTV.controller('DisplayCtrl', ['$scope', 'SettingsService',
  function($scope, SettingsService) {
    $scope.hasTopSites = ('chrome' in window && 'topSites' in window.chrome)
    $scope.hasNotifications = ('chrome' in window && 'notifications' in window.chrome && 'create' in window.chrome.notifications && 'getPermissionLevel' in window.chrome.notifications)
    $scope.topSites = SettingsService.get('topSites.enabled')
    $scope.topSitesMode = SettingsService.get('topSites.mode')
    $scope.bgOpacity = SettingsService.get('background-rotator.opacity')
    $scope.showRatings = SettingsService.get('download.ratings')
    $scope.sgEnabled = SettingsService.get('library.seriesgrid')
    $scope.notWatchedEpsBtn = SettingsService.get('series.not-watched-eps-btn')
    $scope.mcEnabled = !SettingsService.get('font.bebas.enabled')

    $scope.togglenotWatchedEpsBtn = function() {
      $scope.notWatchedEpsBtn = !$scope.notWatchedEpsBtn
      SettingsService.set('series.not-watched-eps-btn', $scope.notWatchedEpsBtn)
    }

    $scope.toggleTopSites = function() {
      $scope.topSites = !$scope.topSites
      SettingsService.set('topSites.enabled', $scope.topSites)
    }

    $scope.toggleTopSitesMode = function() {
      $scope.topSitesMode = $scope.topSitesMode == 'onhover' ? 'onclick' : 'onhover'
      SettingsService.set('topSites.mode', $scope.topSitesMode)
    }

    // Set the various background opacity levels.
    $scope.setBGOpacity = function(opacity) {
      SettingsService.set('background-rotator.opacity', opacity)
      $scope.bgOpacity = opacity
    }

    // Toggles whether to show Ratings on Series and Episode panels
    $scope.toggleRatings = function() {
      $scope.showRatings = !$scope.showRatings
      SettingsService.set('download.ratings', $scope.showRatings)
    }

    // Toggles the Series-Grid on Series-List
    $scope.toggleSeriesGrid = function() {
      $scope.sgEnabled = !$scope.sgEnabled
      SettingsService.set('library.seriesgrid', $scope.sgEnabled)
      window.location.reload()
    }

    // Toggles the bebas enabled font (for mixed case display)
    $scope.toggleMixedCase = function() {
      $scope.mcEnabled = !$scope.mcEnabled
      if ($scope.mcEnabled) {
        localStorage.setItem('font.bebas.disabled', 'true')
      } else {
        localStorage.removeItem('font.bebas.disabled')
      }

      SettingsService.set('font.bebas.enabled', !$scope.mcEnabled)
      window.location.reload()
    }
  }
])
;
DuckieTV.controller('WindowCtrl', ['$scope', '$filter',
  function($scope, $filter) {
    /**
     * All nw.js specific window settings are stored in localStorage because
     * they need to be accessed before DuckieTV starts up
     */

    $scope.startupMinimized = (localStorage.getItem('standalone.startupMinimized') === 'Y')
    $scope.alwaysShowTray = localStorage.getItem('standalone.alwaysShowTray')
    $scope.minimizeToTray = localStorage.getItem('standalone.minimizeSystray')
    $scope.closeToTray = localStorage.getItem('standalone.closeSystray')
    $scope.activeTrayColor = 'black' // default color of the tray icon
    if (localStorage.getItem('standalone.trayColor')) {
      $scope.activeTrayColor = (localStorage.getItem('standalone.trayColor') === '') ? 'black' : localStorage.getItem('standalone.trayColor').replace('-', '').replace('inverted', 'white')
    }
    $scope.colorList = 'black|white|red|orange|yellow|green|blue|indigo|violet'.split('|') // used by $scope.translateColor()
    var translatedColorList = $filter('translate')('COLORLIST').split('|')

    // Takes the English color and returns a translation
    $scope.translateColor = function(color) {
      var idx = $scope.colorList.indexOf(color)
      return (idx != -1) ? translatedColorList[idx] : color
    }

    // Toggles whether to minimize the Standalone window at start-up
    $scope.toggleStartupMinimized = function() {
      $scope.startupMinimized = !$scope.startupMinimized
      // console.debug("Minimize Startup", $scope.startupMinimized);
      localStorage.setItem('standalone.startupMinimized', $scope.startupMinimized ? 'Y' : 'N')
    }

    // Toggles whether minimize button minimizes to tray
    $scope.toggleAlwaysShowTray = function() {
      // console.debug("Always show tray", $scope.alwaysShowTray);
      localStorage.setItem('standalone.alwaysShowTray', $scope.alwaysShowTray)
      window.location.reload()
    }

    // Toggles whether minimize button minimizes to tray
    $scope.toggleMinimizeToTray = function() {
      // console.debug("Minimize to tray", $scope.minimizeToTray);
      localStorage.setItem('standalone.minimizeSystray', $scope.minimizeToTray)
    }

    // Toggles whether close button minimizes to tray
    $scope.toggleCloseToTray = function() {
      // console.debug("Close to tray", $scope.closeToTray);
      localStorage.setItem('standalone.closeSystray', $scope.closeToTray)
    }

    // Sets the colour of the tray icon
    $scope.setTrayColor = function(color) {
      switch (color) {
        case 'black':
          localStorage.setItem('standalone.trayColor', '')
          break
        case 'white':
          localStorage.setItem('standalone.trayColor', '-inverted')
          break
        default:
          localStorage.setItem('standalone.trayColor', '-' + color)
      }
      $scope.activeTrayColor = color
      window.location.reload()
    }
  }
])
;
/*
 * Controller for the language settings tab
 */
DuckieTV.controller('LanguageCtrl', ['$scope', 'SettingsService',
  function($scope, SettingsService) {
    $scope.activeLocale = SettingsService.get('application.locale')
    $scope.clientLocale = SettingsService.get('client.determinedlocale')

    // Set up the language list used in settings/display template
    $scope.languageList = {
      'el_gr': 'el_gr',
      'en_au': 'au',
      'en_ca': 'ca',
      'en_nz': 'nz',
      'en_uk': 'uk',
      'en_us': 'us',
      'en_za': 'za',
      'de_de': 'de_de',
      'es_es': 'es_es',
      'fr_ca': 'fr_ca',
      'fr_fr': 'fr_fr',
      'it_it': 'it_it',
      'ja_jp': 'ja_jp',
      'ko_kr': 'ko_kr',
      'nl_nl': 'nl_nl',
      'nb_no': 'nb_no',
      'pt_br': 'pt_br',
      'pt_pt': 'pt_pt',
      'ro_ro': 'ro_ro',
      'ru_ru': 'ru_ru',
      'sk_sk': 'sk_sk',
      'sl_si': 'sl_si',
      'sv_se': 'sv_se',
      'tr_tr': 'tr_tr',
      'zh_cn': 'zh_cn'
    }

    // Change localization an translations, reloads translation table.
    $scope.setLocale = function(lang) {
      SettingsService.changeLanguage(lang)
      $scope.activeLocale = lang
      window.location.reload()
    }

    // test if determined locale is one of our supported languages
    $scope.isSupported = function(lang) {
      return lang in $scope.languageList
    }
  }
])
;
/**
 * Controller for the torrent related setting tabs (auto-download, torrent-search, torrent, utorrent)
 */
DuckieTV.controller('SettingsTorrentCtrl', ['$scope', '$rootScope', 'SettingsService', 'DuckieTorrent', 'TorrentSearchEngines', 'ThePirateBayMirrorResolver', 'AutoDownloadService',
  function($scope, $rootScope, SettingsService, DuckieTorrent, TorrentSearchEngines, ThePirateBayMirrorResolver, AutoDownloadService) {
    $scope.log = []

    $scope.customtpbmirror = SettingsService.get('ThePirateBay.mirror')
    $scope.searchprovider = SettingsService.get('torrenting.searchprovider')
    $scope.searchquality = SettingsService.get('torrenting.searchquality')

    $scope.torrentEnabled = SettingsService.get('torrenting.enabled')
    $scope.allowUnsafe = SettingsService.get('proxy.allowUnsafe')
    $scope.RequireKeywordsModeOR = SettingsService.get('torrenting.require_keywords_mode_or')
    $scope.directoryEnabled = SettingsService.get('torrenting.directory')
    $scope.streamingEnabled = SettingsService.get('torrenting.streaming')
    $scope.progressEnabled = SettingsService.get('torrenting.progress')
    $scope.autostopEnabled = SettingsService.get('torrenting.autostop')
    $scope.autostopAllEnabled = SettingsService.get('torrenting.autostop_all')
    $scope.adEnabled = SettingsService.get('torrenting.autodownload')
    $scope.adPeriod = SettingsService.get('autodownload.period')
    $scope.minSeeders = SettingsService.get('torrenting.min_seeders')
    $scope.chromiumEnabled = SettingsService.get('torrenting.launch_via_chromium')
    $scope.useTD2 = SettingsService.get('torrentDialog.2.enabled')
    $scope.adDelay = SettingsService.get('autodownload.delay').minsToDhm()
    $scope.labelEnabled = SettingsService.get('torrenting.label')
    $scope.isLabelSupported = ($scope.torrentEnabled) ? DuckieTorrent.getClient().isLabelSupported() : false

    $scope.tpbmirrorStatus = []

    $scope.searchProviders = Object.keys(TorrentSearchEngines.getSearchEngines())
    $scope.jackettProviders = TorrentSearchEngines.getJackettEngines()

    $scope.requireKeywords = SettingsService.get('torrenting.require_keywords')
    $scope.ignoreKeywords = SettingsService.get('torrenting.ignore_keywords')
    $scope.globalSizeMin = SettingsService.get('torrenting.global_size_min')
    $scope.globalSizeMax = SettingsService.get('torrenting.global_size_max')

    $scope.usingMultiSE = SettingsService.get('autodownload.multiSE.enabled')
    $scope.multiSE = SettingsService.get('autodownload.multiSE') // get multi search engines list previously saved
    $scope.searchProviders.forEach(function(name) {
      // add any new search engines discovered, default them as active.
      if (!(name in $scope.multiSE)) {
        $scope.multiSE[name] = true
      }
    })
    SettingsService.set('autodownload.multiSE', $scope.multiSE) // save updated multiSE list.

    // save multi Search Engine states
    $scope.saveMultiSE = function() {
      SettingsService.set('autodownload.multiSE', $scope.multiSE)
      AutoDownloadService.detach() // recycle AD to pick up changes.
      AutoDownloadService.attach()
    }

    /**
     * Toggle the AutoDownload Multi Search Engines usage
     */
    $scope.toggleUsingMultiSE = function() {
      $scope.usingMultiSE = !$scope.usingMultiSE
      SettingsService.set('autodownload.multiSE.enabled', $scope.usingMultiSE)
      AutoDownloadService.detach() // recycle AD to pick up changes.
      AutoDownloadService.attach()
    }

    /**
     * Inject an event to display mirror resolving progress.
     */
    $rootScope.$on('tpbmirrorresolver:status', function(evt, status) {
      $scope.tpbmirrorStatus.unshift(status)
    })

    /**
     * @todo : migrate these to a directive that's a generic interface for mirror resolvers based on the config.MirrorResolver properties
     */

    /*
    * Resolve a new random ThePirateBay mirror.
    * Log progress while this is happening.
    * Save the new mirror in the thepiratebay.mirror settings key
    */
    $scope.findRandomTPBMirror = function() {
      ThePirateBayMirrorResolver.findTPBMirror().then(function(result) {
        $scope.customtpbmirror = result
        SettingsService.set('ThePirateBay.mirror', $scope.customtpbmirror)
        $rootScope.$broadcast('tpbmirrorresolver:status', 'Saved!')
      }, function(err) {
        console.error('Could not find a working TPB mirror!', err)
      })
    }

    /**
     * Validate a mirror by checking if it doesn't proxy all links and supports magnet uri's
     */
    $scope.validateCustomTPBMirror = function(mirror) {
      $scope.mirrorStatus = []
      ThePirateBayMirrorResolver.verifyTPBMirror(mirror).then(function(result) {
        $scope.customtpbmirror = result
        SettingsService.set('ThePirateBay.mirror', $scope.customtpbmirror)
        $rootScope.$broadcast('tpbmirrorresolver:status', 'Saved!')
      }, function() {
        console.error('Could not validate custom mirror!', mirror)
        // $scope.customMirror = '';
      })
    }

    $scope.toggleTorrent = function() {
      $scope.torrentEnabled = !$scope.torrentEnabled
      SettingsService.set('torrenting.enabled', $scope.torrentEnabled)
      window.location.reload()
    }

    $scope.toggleUnsafeProxy = function() {
      $scope.allowUnsafe = !$scope.allowUnsafe
      SettingsService.set('proxy.allowUnsafe', $scope.allowUnsafe)
    }

    $scope.toggleRequireKeywordsMode = function() {
      $scope.RequireKeywordsModeOR = !$scope.RequireKeywordsModeOR
      SettingsService.set('torrenting.require_keywords_mode_or', $scope.RequireKeywordsModeOR)
    }

    $scope.toggleTD2 = function() {
      $scope.useTD2 = !$scope.useTD2
      SettingsService.set('torrentDialog.2.enabled', $scope.useTD2)
      window.location.reload()
    }

    $scope.toggleDirectory = function() {
      $scope.directoryEnabled = !$scope.directoryEnabled
      SettingsService.set('torrenting.directory', $scope.directoryEnabled)
    }

    $scope.toggleLabel = function() {
      $scope.labelEnabled = !$scope.labelEnabled
      SettingsService.set('torrenting.label', $scope.labelEnabled)
    }

    $scope.toggleProgress = function() {
      $scope.progressEnabled = !$scope.progressEnabled
      SettingsService.set('torrenting.progress', $scope.progressEnabled)
    }

    $scope.toggleStreaming = function() {
      $scope.streamingEnabled = !$scope.streamingEnabled
      SettingsService.set('torrenting.streaming', $scope.streamingEnabled)
    }

    $scope.toggleAutoStop = function() {
      $scope.autostopEnabled = !$scope.autostopEnabled
      SettingsService.set('torrenting.autostop', $scope.autostopEnabled)
    }

    $scope.toggleAutoStopAll = function() {
      $scope.autostopAllEnabled = !$scope.autostopAllEnabled
      SettingsService.set('torrenting.autostop_all', $scope.autostopAllEnabled)
    }

    $scope.toggleAutoDownload = function() {
      $scope.adEnabled = !$scope.adEnabled
      SettingsService.set('torrenting.autodownload', $scope.adEnabled)
      $scope.adEnabled ? AutoDownloadService.attach() : AutoDownloadService.detach()
    }

    $scope.toggleChromium = function() {
      $scope.chromiumEnabled = !$scope.chromiumEnabled
      SettingsService.set('torrenting.launch_via_chromium', $scope.chromiumEnabled)
    }

    /**
     * Change the default torrent search provider
     */
    $scope.setSearchProvider = function(provider) {
      $scope.searchprovider = provider
      SettingsService.set('torrenting.searchprovider', provider)
      TorrentSearchEngines.setDefault(provider)
      if ($scope.adEnabled) {
        AutoDownloadService.detach()
        AutoDownloadService.attach()
      }
    }

    /**
     * Changes the default torrent search quality (hdtv, 720p, etc)
     */
    $scope.setSearchQuality = function(quality) {
      SettingsService.set('torrenting.searchquality', quality)
      $scope.searchquality = quality
    }

    /**
     * Changes the period allowed to AutoDownload episodes
     */
    $scope.saveADPeriod = function(period) {
      SettingsService.set('autodownload.period', period)
      AutoDownloadService.detach() // restart kickoff method when changing search period and seeders.
      AutoDownloadService.attach()
    }

    /**
     * Changes the delay that AutoDownload waits before searching for an episodes' torrent
     */
    $scope.saveADDelay = function(delay) {
      SettingsService.set('autodownload.delay', delay.dhmToMins())
      AutoDownloadService.detach() // restart kickoff method.
      AutoDownloadService.attach()
    }

    /**
     * Changes the amount of seeders required
     */
    $scope.saveMinSeeders = function(seeds) {
      SettingsService.set('torrenting.min_seeders', seeds)
      AutoDownloadService.detach() // restart kickoff method when changing search period and seeders.
      AutoDownloadService.attach()
    }

    $scope.isuTorrentAuthenticated = function() {
      return localStorage.getItem('utorrent.token') !== null
    }

    $scope.getToken = function() {
      return localStorage.getItem('utorrent.token')
    }

    $scope.removeToken = function() {
      localStorage.removeItem('utorrent.token')
    }

    $scope.connect = function() {
      localStorage.removeItem('utorrent.preventconnecting')
      window.location.reload()
    }

    $scope.getTorrentClients = function() {
      return Object.keys(DuckieTorrent.getClients())
    }

    $scope.setTorrentClient = function(name) {
      localStorage.setItem('torrenting.client', name)
      SettingsService.set('torrenting.client', name) // for use in templates
      DuckieTorrent.getClient().Disconnect()
      $scope.currentClient = name
      $scope.connect()
    }

    $scope.currentClient = localStorage.getItem('torrenting.client')

    $scope.reload = function() {
      window.location.reload()
    }

    /**
     * Save Require Keywords list
     */
    $scope.saveRequireKeywords = function(list) {
      $scope.requireKeywords = list
      SettingsService.set('torrenting.require_keywords', $scope.requireKeywords)
    }

    /**
     * Save ignore keyword list
     */
    $scope.saveIgnoreKeywords = function(list) {
      $scope.ignoreKeywords = list
      SettingsService.set('torrenting.ignore_keywords', $scope.ignoreKeywords)
    }

    /**
     * Save Global Size Min
     */
    $scope.saveGlobalSizeMin = function(size) {
      $scope.globalSizeMin = size
      SettingsService.set('torrenting.global_size_min', $scope.globalSizeMin)
    }

    /**
     * Save Global Size Max
     */
    $scope.saveGlobalSizeMax = function(size) {
      $scope.globalSizeMax = size
      SettingsService.set('torrenting.global_size_max', $scope.globalSizeMax)
    }

    /**
     * is provider a Jackett SE?
     */
    $scope.isJackett = function(jse) {
      return (jse in $scope.jackettProviders && $scope.jackettProviders[jse].enabled)
    }
  }
])

DuckieTV.directive('adDelayValidation', ['SettingsService',
  function(SettingsService) {
    return {
      restrict: 'A',
      require: 'ngModel',
      link: function (scope, element, attr, ctrl) {
        function validationError(value) {
          // if empty then exit
          if (value === null || undefined === value || value === '') {
            ctrl.$setValidity('addelayinvalid', true)
            return value
          }
          // customDelay.max cannot exceed adPeriod (days converted to minutes).
          var adDelayMaxMinutes = parseInt(SettingsService.get('autodownload.period') * 24 * 60)
          // parse dhm
          var dhmPart = value.split(/[\s:]+/)
          var days = parseInt(dhmPart[0])
          var hours = parseInt(dhmPart[1])
          var minutes = parseInt(dhmPart[2])
          // test validity
          var valid = (days >= 0 && days <= 21 && hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59 && value.dhmToMins() <= adDelayMaxMinutes)
          // set error state
          ctrl.$setValidity('addelayinvalid', valid)
          return value
        }
        // insert function into parsers list
        ctrl.$parsers.push(validationError)
      }
    }
  }])
;
DuckieTV.controller('SubtitlesCtrl', ['OpenSubtitles', 'SettingsService',
  function(OpenSubtitles, SettingsService) {
    var vm = this
    var allLanguages = OpenSubtitles.getLangages()
    var reverseLanguages = {}

    Object.keys(allLanguages).map(function(key) {
      reverseLanguages[allLanguages[key]] = key
    })

    vm.languages = Object.keys(allLanguages).map(function(key) {
      return allLanguages[key]
    })
    vm.codes = OpenSubtitles.getShortCodes()

    vm.enabled = SettingsService.get('subtitles.languages')

    vm.isEnabled = function(code) {
      return vm.enabled.indexOf(reverseLanguages[code]) > -1
    }

    vm.getShortCode = function(lang) {
      return vm.codes[reverseLanguages[lang]]
    }

    vm.getEnabledLanguages = function() {
      vm.enabledLanguages = vm.enabled.map(function(code) {
        return allLanguages[code]
      }).join(', ')
      return vm.enabledLanguages
    }

    vm.selectNone = function() {
      SettingsService.set('subtitles.languages', [])
      vm.enabled = []
      vm.enabledLanguages = ''
    }

    vm.toggleSubtitle = function(language) {
      console.debug('togglesubtitle', language, reverseLanguages[language])
      var lang = reverseLanguages[language]
      if (vm.enabled.indexOf(lang) === -1) {
        vm.enabled.push(lang)
      } else {
        vm.enabled.splice(vm.enabled.indexOf(lang), 1)
      }

      SettingsService.set('subtitles.languages', vm.enabled)
      vm.getEnabledLanguages()
    }

    vm.getEnabledLanguages()
  }
])
;
/**
 * Controller for Sync settings tab
 * *************** NOT IN USE ************************
 */
DuckieTV.controller('SyncCtrl', ['$scope', 'StorageSyncService', 'TraktTVv2',
  function($scope, StorageSyncService, TraktTVv2) {
    $scope.targets = StorageSyncService.targets

    $scope.read = function(StorageEngine) {
      StorageEngine.getSeriesList().then(function(result) {
        StorageEngine.series = []
        result.map(function(TRAKT_ID) {
          return TraktTVv2.resolveID(TRAKT_ID, true).then(function(searchResult) {
            return TraktTVv2.serie(searchResult.trakt_id)
          }).then(function(serie) {
            StorageEngine.series.push(serie)
          })
        })
      })
    }

    $scope.compare = function(StorageEngine) {
      StorageSyncService.compareTarget(StorageEngine, true)
    }

    console.log($scope.targets)
  }
])
;
DuckieTV.controller('SynologyCtrl', ['SynologyAPI', 'SettingsService', 'FormlyLoader', '$scope',
  function(SynologyAPI, SettingsService, FormlyLoader, $scope) {
    var self = this
    this.enabled = SettingsService.get('synology.enabled')

    FormlyLoader.setMapping('protocols', [{
      name: 'http'
    }, {
      name: 'https'
    }])

    FormlyLoader.load('SynologySettings').then(function(fields) {
      self.model = {
        protocol: SettingsService.get('synology.protocol'),
        ip: SettingsService.get('synology.ip'),
        port: SettingsService.get('synology.port'),
        username: SettingsService.get('synology.username'),
        password: SettingsService.get('synology.password')
      }

      self.fields = fields
    })

    this.connecting = false
    this.error = null

    this.isAuthenticated = function() {
      return SynologyAPI.isAuthenticated()
    }

    this.deAuthorize = function() {
      self.sessionID = null
      return SynologyAPI.deAuthorize()
    }

    this.sessionID = SynologyAPI.getSessionID()

    this.toggleEnabled = function() {
      this.enabled = !this.enabled
      SettingsService.set('synology.enabled', this.enabled)
    }

    this.deviceList = null
    if (this.sessionID !== null) {
      SynologyAPI.init().then(SynologyAPI.DeviceList).then(function(devices) {
        self.deviceList = devices
      })
    }

    this.test = function() {
      this.connecting = true
      this.error = false
      SynologyAPI.setConfig(this.model)
      SynologyAPI.init().then(function(success) {
        console.info('Synology connected! (saving settings)', success)
        SettingsService.set('synology.protocol', self.model.protocol)
        SettingsService.set('synology.ip', self.model.ip)
        SettingsService.set('synology.port', self.model.port)
        SettingsService.set('synology.username', self.model.username)
        SettingsService.set('synology.password', self.model.password)
        self.connecting = false
        self.connected = true
        self.error = null
        self.sessionID = SynologyAPI.getSessionID()
        SynologyAPI.DeviceList().then(function(devices) {
          self.deviceList = devices
        })
      }, function(error) {
        self.connecting = false
        self.connected = false
        self.error = error.message
        console.error('Synology connect error!', error)
      })
    }
  }
])
;
/**
 * TraktTV Controller for TraktTV Directive Stuff and the settings tab
 */
DuckieTV.controller('TraktTVCtrl', ['$rootScope', 'TraktTVv2', 'FavoritesService', 'SettingsService',
  function($rootScope, TraktTVv2, FavoritesService, SettingsService) {
    var vm = this

    // Array for credentials
    vm.credentials = {
      pincode: '',
      success: localStorage.getItem('trakttv.token') || false,
      error: false,
      authorizing: false,
      getpin: false
    }

    vm.tuPeriod = SettingsService.get('trakt-update.period')
    vm.traktSync = SettingsService.get('trakttv.sync')
    vm.downloadedPaired = SettingsService.get('episode.watched-downloaded.pairing')
    vm.traktTVSeries = []
    vm.pushError = [false, null]
    vm.onlyCollection = false
    vm.watchedEpisodes = 0
    vm.downloadedEpisodes = 0

    vm.onAuthorizeEnter = function() {
      window.open(vm.getPinUrl(), '_blank')
      vm.credentials.getpin = true
    }

    vm.onLoginEnter = function() {
      vm.authorize(vm.credentials.pincode)
    }

    vm.getPin = function() {
      vm.credentials.getpin = true
    }

    // Clears all local credentials and token in local storage
    vm.clearCredentials = function() {
      vm.credentials.pincode = ''
      vm.credentials.success = false
      vm.credentials.error = false
      vm.credentials.authorizing = false
      vm.credentials.getpin = false
      localStorage.removeItem('trakttv.token')
      localStorage.removeItem('trakttv.refresh_token')
    }

    // renew credentials
    vm.renewCredentials = function() {
      return TraktTVv2.renewToken().then(function(result) {
        vm.credentials.success = result
      }, function(error) {
        if (error.data && error.data.error && error.data.error_description) {
          vm.credentials.error = 'Error! ' + error.status + ' - ' + error.data.error + ' - ' + error.data.error_description
        } else {
          vm.credentials.error = 'Error! ' + error.status + ' - ' + error.statusText
        }
      })
    }

    // Validates pin with TraktTV
    vm.authorize = function(pin) {
      vm.credentials.authorizing = true
      return TraktTVv2.login(pin).then(function(result) {
        vm.credentials.success = result
        vm.credentials.error = false
        vm.credentials.authorizing = false
      }, function(error) {
        vm.clearCredentials()
        if (error.data && error.data.error && error.data.error_description) {
          vm.credentials.error = 'Error! ' + error.status + ' - ' + error.data.error + ' - ' + error.data.error_description
        } else {
          vm.credentials.error = 'Error! ' + error.status + ' - ' + error.statusText
        }
      })
    }

    vm.getPinUrl = function() {
      return TraktTVv2.getPinUrl()
    }

    /* Note: I intentionally used my own cache and not the FavoritesService adding Cache because
    *  if we use FavoritesService cache while importing on the Serieslist it will also cause
    *  all the shows below that are being added to update with the spinners and with a lot of
    *  series the performance impact is noticeable.
    */
    vm.isAdding = function(trakt_id) {
      return addedSeries.indexOf(trakt_id) === -1
    }

    // Imports users collected Series and Watched episodes from TraktTV
    var collectionIDCache = []
    var addedSeries = []
    var localSeries = {}
    var alreadyImported = false

    vm.readTraktTV = function() {
      if (alreadyImported) return

      var watchedShowIdMapping = {}
      var collectedShowIdMapping = {}

      alreadyImported = true
      FavoritesService.getSeries().then(function(series) {
        console.info('Mapping currently added series')
        series.map(function(serie) {
          localSeries[serie.TRAKT_ID] = serie
        })
      }).then(TraktTVv2.userShows().then(function(userShows) {
        console.info('Found', userShows.length, 'shows in users collection')
        TraktTVv2.watched().then(function(watchedShows) {
          console.info('Found', watchedShows.length, 'shows in users watched episodes collection')

          // Go through and determine all the shows we're adding
          userShows.forEach(function(serie) {
            collectedShowIdMapping[serie.trakt_id] = serie
            vm.traktTVSeries.push(serie)
            collectionIDCache.push(serie.trakt_id)
          })

          watchedShows.forEach(function(serie) {
            watchedShowIdMapping[serie.trakt_id] = serie

            if (!vm.onlyCollection && collectionIDCache.indexOf(serie.trakt_id) == -1) {
              vm.traktTVSeries.push(serie)
              collectionIDCache.push(serie.trakt_id)
            }
          })

          // add the shows
          Promise.all(vm.traktTVSeries.map(function(serie) {
            if (serie.trakt_id in localSeries) { // Don't re-add serie if it's already added
              return Promise.resolve(serie)
            }

            return TraktTVv2.serie(serie.trakt_id).then(function(data) {
              return FavoritesService.addFavorite(data).then(function(s) {
                localSeries[serie.trakt_id] = s
                return serie
              })
            }).catch(function() {}) // Ignore errors, resolve anyway
          })).then(function() {
            console.info('Done importing shows and adding them to database. Marking episodes as downloaded/watched')
            Promise.all(vm.traktTVSeries.map(function(serie) {
              var show = collectedShowIdMapping[serie.trakt_id] || { seasons: [] } // just to be safe

              return Promise.all(show.seasons.map(function(season) {
                return Promise.all(season.episodes.map(function(episode) {
                  return CRUD.FindOne('Episode', {
                    seasonnumber: season.number,
                    episodenumber: episode.number,
                    'Serie': {
                      TRAKT_ID: show.trakt_id
                    }
                  }).then(function(epi) {
                    if (!epi) {
                      console.warn('Episode s%se%s not found for %s', season.number, episode.number, show.name)
                    } else {
                      vm.downloadedEpisodes++
                      return epi.markDownloaded()
                    }
                  }).catch(function() {})
                }))
              })).then(function() {
                console.info('Successfully marked all episodes as downloaded. Marking all episodes as watched.')
                var show = watchedShowIdMapping[serie.trakt_id] || { seasons: [] } // just to be safe

                return Promise.all(show.seasons.map(function(season) {
                  return Promise.all(season.episodes.map(function(episode) {
                    return CRUD.FindOne('Episode', {
                      seasonnumber: season.number,
                      episodenumber: episode.number,
                      'Serie': {
                        TRAKT_ID: show.trakt_id
                      }
                    }).then(function(epi) {
                      if (!epi) {
                        console.warn('Episode s%se%s not found for %s', season.number, episode.number, show.name)
                      } else {
                        vm.watchedEpisodes++
                        return epi.markWatched(vm.downloadedPaired)
                      }
                    }).catch(function() {})
                  }))
                })).then(function() {
                  addedSeries.push(serie.trakt_id)
                })
              })
            })).then(function() {
              console.info('Finished marking all episodes as downloaded/watched.')
              setTimeout(function() {
                console.info('Firing series:recount:watched')
                $rootScope.$broadcast('series:recount:watched')
              }, 6000)
            })
          })
        })
      }))
    }

    // Push current series and watched episodes to TraktTV
    vm.pushToTraktTV = function() {
      FavoritesService.favorites.map(function(serie) {
        TraktTVv2.addShowToCollection(serie)
      })

      CRUD.Find('Episode', {
        'watched': '1'
      }, {
        limit: '100000'
      }).then(function(episodes) {
        TraktTVv2.markEpisodesWatched(episodes)
        console.info("Marking Trakt.TV user's episodes as watched.", episodes)
      })
    }

    vm.toggleTraktSync = function() {
      vm.traktSync = !vm.traktSync
      SettingsService.set('trakttv.sync', vm.traktSync)
    }

    /**
     * Changes the hourly period DuckieTV fetches Trakt.TV episodes updates with.
     */
    vm.saveTUPeriod = function(period) {
      SettingsService.set('trakt-update.period', period)
      window.location.reload()
    }
  }
])
;
DuckieTV.controller('serieSettingsCtrl', ['$scope', '$filter', '$uibModalInstance', 'FavoritesService', 'SettingsService', 'FormlyLoader', 'data', 'TorrentSearchEngines', 'DuckieTorrent', 'SceneXemResolver',
  function($scope, $filter, $modalInstance, FavoritesService, SettingsService, FormlyLoader, data, TorrentSearchEngines, DuckieTorrent, SceneXemResolver) {
    // customDelay.max cannot exceed adPeriod (days converted to minutes).
    var adDelayMaxMinutes = parseInt(SettingsService.get('autodownload.period') * 24 * 60)

    /**
     * set up form field contents
     */
    FormlyLoader.load('SerieSettings').then(function(form) {
      $scope.model = FavoritesService.getByTRAKT_ID(data.serie.TRAKT_ID) // refresh the model because it's cached somehow by the $modalInstance. (serialisation probably)
      $scope.model.ignoreHideSpecials = $scope.model.ignoreHideSpecials == 1
      $scope.model.autoDownload = $scope.model.autoDownload == 1
      $scope.model.ignoreGlobalQuality = $scope.model.ignoreGlobalQuality == 1
      $scope.model.ignoreGlobalIncludes = $scope.model.ignoreGlobalIncludes == 1
      $scope.model.ignoreGlobalExcludes = $scope.model.ignoreGlobalExcludes == 1
      $scope.model.hasXemAlias = (SceneXemResolver.getXemAliasListForSerie(data.serie).length > 0)

      // determine if client is local or remote (not fool proof, is there a better way?)
      var server
      if (DuckieTorrent.getClient().getName() === 'uTorrent') {
        server = 'http://localhost' // uTorrent does not have a config.server
      } else {
        server = DuckieTorrent.getClient().config.server
      }

      var isLocal = (server === 'http://127.0.0.1' || server === 'http://localhost')
      var isStandalone = (SettingsService.isStandalone()) // determine if this is standalone
      var isDownloadPathSupported = DuckieTorrent.getClient().isDownloadPathSupported() // determine if downloadPath is supported by client

      $scope.model.dlPathLocal = $scope.model.dlPath
      $scope.model.dlPathRemote = $scope.model.dlPath

      $scope.model.isDownloadPathSupportedLocal = (isDownloadPathSupported && isStandalone && isLocal)
      $scope.model.isDownloadPathSupportedRemote = (isDownloadPathSupported && ((!isStandalone) || (isStandalone && !isLocal)))

      // note: we are not using $scope.model.customDelay directly as input, to prevent downstream issues with dialogue save and cancel
      $scope.model.customDelayInput = ($scope.model.customDelay === null) ? null : $scope.model.customDelay.minsToDhm()
      $scope.fields = form
    })

    /**
     * set up select list for search providers
     */
    $scope.searchProviders = [{'name': '', 'value': null}]
    Object.keys(TorrentSearchEngines.getSearchEngines()).map(function(searchProvider) {
      $scope.searchProviders.push({'name': searchProvider, 'value': searchProvider})
    })

    /**
     * set up select list for xem alias
     */
    $scope.searchAlias = [{'name': '', 'value': null}]
    SceneXemResolver.getXemAliasListForSerie(data.serie).map(function(alias) {
      $scope.searchAlias.push({'name': alias, 'value': alias})
    })
    FormlyLoader.setMapping('options', {
      'searchProviders': $scope.searchProviders,
      'searchAlias': $scope.searchAlias
    })

    /**
     * set up delay error message interpolation
     */
    FormlyLoader.setMapping('data', {
      'delayErrorMessage': '"' + $filter('translate')('COMMON/autodownload-delay-range/alert', {addelaymax: adDelayMaxMinutes.minsToDhm()}) + '"'
    })

    /**
     * set up days, hours and minutes validation
     */
    FormlyLoader.setMapping('validators', {
      'customDelayInput': {
        'expression': function(viewValue, modelValue, scope) {
          var value = modelValue || viewValue
          // if empty then exit
          if (value === null || undefined === value || value === '') {
            return true
          }
          // parse dhm
          var dhmPart = value.split(/[\s:]+/)
          var days = parseInt(dhmPart[0])
          var hours = parseInt(dhmPart[1])
          var minutes = parseInt(dhmPart[2])
          // test validity and set error state
          return (days >= 0 && days <= 21 && hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59 && value.dhmToMins() <= adDelayMaxMinutes)
        }
      }
    })

    /**
     * save and persist model
     */
    $scope.save = function() {
      $scope.model.ignoreHideSpecials = $scope.model.ignoreHideSpecials ? 1 : 0
      $scope.model.autoDownload = $scope.model.autoDownload ? 1 : 0
      $scope.model.ignoreGlobalQuality = $scope.model.ignoreGlobalQuality ? 1 : 0
      $scope.model.ignoreGlobalIncludes = $scope.model.ignoreGlobalIncludes ? 1 : 0
      $scope.model.ignoreGlobalExcludes = $scope.model.ignoreGlobalExcludes ? 1 : 0
      // despite (because?) type=number, some invalid data trapped by formly returns undefined. so this ensures that we persist as null to stop downstream errors.
      $scope.model.customSeeders = (typeof $scope.model.customSeeders === 'undefined') ? null : $scope.model.customSeeders
      $scope.model.customSearchSizeMin = (typeof $scope.model.customSearchSizeMin === 'undefined') ? null : $scope.model.customSearchSizeMin
      $scope.model.customSearchSizeMax = (typeof $scope.model.customSearchSizeMax === 'undefined') ? null : $scope.model.customSearchSizeMax
      $scope.model.customDelay = (typeof $scope.model.customDelayInput === 'undefined' || $scope.model.customDelayInput === null || $scope.model.customDelayInput === '') ? null : $scope.model.customDelayInput.dhmToMins()
      if ($scope.model.isDownloadPathSupportedLocal) {
        // save model dlPath from content of model dlPathLocal
        $scope.model.dlPath = (typeof $scope.model.dlPathLocal === 'undefined' || $scope.model.dlPathLocal === '') ? null : $scope.model.dlPathLocal
      }
      if ($scope.model.isDownloadPathSupportedRemote) {
        // save model dlPath from content of model dlPathRemote
        $scope.model.dlPath = (typeof $scope.model.dlPathRemote === 'undefined' || $scope.model.dlPathRemote === '') ? null : $scope.model.dlPathRemote
      }

      $scope.model.Persist().then(function() {
        $modalInstance.close()
        $scope.$destroy()
      })
    }

    /**
     * get out of dodge
     */
    $scope.cancel = function() {
      $modalInstance.close()
      $scope.$destroy()
    }
  }
])

DuckieTV.directive('downloadpath', [function () {
  return {
    scope: {
      downloadpath: '='
    },
    link: function (scope, element, attributes) {
      element.bind('change', function (changeEvent) {
        scope.$apply(function () {
          scope.downloadpath = changeEvent.target.files[0].path
        })
      })
    }
  }
}])
;
/*
 * Controller for the miscellaneous settings tab
 */
DuckieTV.controller('MiscellaneousCtrl', ['$scope', 'SettingsService',
  function($scope, SettingsService) {
    $scope.watchedDownloadedPaired = SettingsService.get('episode.watched-downloaded.pairing')

    // Toggles whether the episodes watched and downloaded states should be paired
    $scope.togglewatchedDownloadedPaired = function() {
      $scope.watchedDownloadedPaired = !$scope.watchedDownloadedPaired
      SettingsService.set('episode.watched-downloaded.pairing', $scope.watchedDownloadedPaired)
    }
  }
])
;
DuckieTV.controller('aria2Ctrl', ['Aria2', 'SettingsService', 'FormlyLoader',
  function(Aria2, SettingsService, FormlyLoader) {
    var vm = this
    vm.error = null

    FormlyLoader.load('TorrentClientSettings').then(function(fields) {
      vm.model = {
        server: SettingsService.get('aria2.server'),
        port: SettingsService.get('aria2.port'),
        token: SettingsService.get('aria2.token')
      }

      vm.fields = fields
    })

    vm.isConnected = function() {
      return Aria2.isConnected()
    }

    vm.test = function() {
      vm.error = false
      // console.log("Testing settings");
      Aria2.Disconnect()
      Aria2.setConfig(vm.model)
      Aria2.connect().then(function(connected) {
        console.info('Aria2 connected! (save settings)', connected)
        vm.error = null
        Aria2.saveConfig()
        window.location.reload()
      }, function(error) {
        vm.error = error
        console.error('Aria2 connect error!', error)
      })
    }
  }
])
;
DuckieTV.controller('biglybtCtrl', ['BiglyBT', 'SettingsService', 'FormlyLoader',
  function(BiglyBT, SettingsService, FormlyLoader) {
    var vm = this
    vm.error = null

    FormlyLoader.load('TorrentClientSettings').then(function(fields) {
      vm.model = {
        server: SettingsService.get('biglybt.server'),
        port: SettingsService.get('biglybt.port'),
        path: SettingsService.get('biglybt.path'),
        use_auth: SettingsService.get('biglybt.use_auth'),
        username: SettingsService.get('biglybt.username'),
        password: SettingsService.get('biglybt.password'),
        progressX100: SettingsService.get('biglybt.progressX100'),
        hidePath: true
      }

      vm.fields = fields
    })

    vm.isConnected = function() {
      return BiglyBT.isConnected()
    }

    vm.test = function() {
      vm.error = false
      // console.log("Testing settings");
      BiglyBT.Disconnect()
      BiglyBT.setConfig(vm.model)
      BiglyBT.connect().then(function(connected) {
        console.info('BiglyBT connected! (save settings)', connected)
        vm.error = null
        BiglyBT.saveConfig()
        window.location.reload()
      }, function(error) {
        vm.error = error
        console.error('BiglyBT connect error!', error)
      })
    }
  }
])
;
DuckieTV.controller('delugeCtrl', ['Deluge', 'SettingsService', 'FormlyLoader',
  function(Deluge, SettingsService, FormlyLoader) {
    var vm = this
    vm.error = null

    vm.isConnected = function() {
      return Deluge.isConnected()
    }

    FormlyLoader.load('TorrentClientSettings').then(function(fields) {
      vm.model = {
        server: SettingsService.get('deluge.server'),
        port: SettingsService.get('deluge.port'),
        use_auth: SettingsService.get('deluge.use_auth'),
        password: SettingsService.get('deluge.password'),
        hideUseAuth: true
      }

      vm.fields = fields
    })

    vm.test = function() {
      vm.error = false
      // console.log("Testing settings");
      Deluge.Disconnect()
      Deluge.setConfig(vm.model)
      Deluge.connect().then(function(connected) {
        console.info('Deluge connected! (save settings)', connected)
        vm.error = null
        Deluge.saveConfig()
        window.location.reload()
      }, function(error) {
        vm.error = error
        console.error('Deluge connect error!', error)
      })
    }
  }
])
;
DuckieTV.controller('qbtCtrl', ['qBittorrent', 'SettingsService', 'FormlyLoader',
  function(qBittorrent, SettingsService, FormlyLoader) {
    var vm = this
    vm.error = null

    FormlyLoader.load('TorrentClientSettings').then(function(fields) {
      vm.model = {
        server: SettingsService.get('qbittorrent.server'),
        port: SettingsService.get('qbittorrent.port'),
        use_auth: SettingsService.get('qbittorrent.use_auth'),
        username: SettingsService.get('qbittorrent.username'),
        password: SettingsService.get('qbittorrent.password')
      }

      vm.fields = fields
    })

    vm.isConnected = function() {
      return qBittorrent.isConnected()
    }

    vm.test = function() {
      vm.error = false
      // console.log("Testing settings");
      qBittorrent.Disconnect()
      qBittorrent.setConfig(vm.model)
      qBittorrent.connect().then(function(connected) {
        console.info('qBittorrent (pre3.2) connected! (save settings)', connected)
        vm.error = null
        qBittorrent.saveConfig()
        window.location.reload()
      }, function(error) {
        vm.error = error
        console.error('qBittorrent {pre3.2) connect error!', error)
      })
    }
  }
])
;
DuckieTV.controller('qbt32plusCtrl', ['qBittorrent32plus', 'SettingsService', 'FormlyLoader',
  function(qBittorrent32plus, SettingsService, FormlyLoader) {
    var vm = this
    vm.error = null

    FormlyLoader.load('TorrentClientSettings').then(function(fields) {
      vm.model = {
        server: SettingsService.get('qbittorrent32plus.server'),
        port: SettingsService.get('qbittorrent32plus.port'),
        use_auth: SettingsService.get('qbittorrent32plus.use_auth'),
        username: SettingsService.get('qbittorrent32plus.username'),
        password: SettingsService.get('qbittorrent32plus.password')
      }

      vm.fields = fields
    })

    vm.isConnected = function() {
      return qBittorrent32plus.isConnected()
    }

    vm.test = function() {
      vm.error = false
      // console.log("Testing settings");
      qBittorrent32plus.Disconnect()
      qBittorrent32plus.setConfig(vm.model)
      qBittorrent32plus.connect().then(function(connected) {
        console.info('qBittorrent 3.2+ connected! (save settings)', connected)
        vm.error = null
        qBittorrent32plus.saveConfig()
        window.location.reload()
      }, function(error) {
        vm.error = error
        console.error('qBittorrent 3.2+ connect error!', error)
      })
    }
  }
])
;
DuckieTV.controller('ktorrentCtrl', ['Ktorrent', 'SettingsService', 'FormlyLoader',
  function(Ktorrent, SettingsService, FormlyLoader) {
    var vm = this
    vm.error = null

    FormlyLoader.load('TorrentClientSettings').then(function(fields) {
      vm.model = {
        server: SettingsService.get('ktorrent.server'),
        port: SettingsService.get('ktorrent.port'),
        use_auth: SettingsService.get('ktorrent.use_auth'),
        username: SettingsService.get('ktorrent.username'),
        password: SettingsService.get('ktorrent.password'),
        hideUseAuth: true
      }

      vm.fields = fields
    })

    vm.isConnected = function() {
      return Ktorrent.isConnected()
    }

    vm.test = function() {
      vm.error = false
      // console.log("Testing settings");
      Ktorrent.Disconnect()
      Ktorrent.setConfig(vm.model)
      Ktorrent.connect().then(function(connected) {
        console.info('Ktorrent connected! (save settings)', connected)
        vm.error = null
        Ktorrent.saveConfig()
        window.location.reload()
      }, function(error) {
        vm.error = error
        console.error('Ktorrent connect error!', error)
      })
    }
  }
])
;
DuckieTV.controller('rTorrentCtrl', ['rTorrent', 'SettingsService', 'FormlyLoader',
  function(rTorrent, SettingsService, FormlyLoader) {
    var vm = this
    vm.error = null

    FormlyLoader.load('TorrentClientSettings').then(function(fields) {
      vm.model = {
        server: SettingsService.get('rtorrent.server'),
        port: SettingsService.get('rtorrent.port'),
        path: SettingsService.get('rtorrent.path')
      }

      vm.fields = fields
    })

    vm.isConnected = function() {
      return rTorrent.isConnected()
    }

    vm.test = function() {
      vm.error = false
      // console.log("Testing settings");
      rTorrent.Disconnect()
      rTorrent.setConfig(vm.model)
      rTorrent.connect().then(function(connected) {
        console.info('rTorrent connected! (save settings)', connected)
        vm.error = null
        rTorrent.saveConfig()
        window.location.reload()
      }, function(error) {
        vm.error = error
        console.error('rTorrent connect error!', error)
      })
    }
  }
])
;
DuckieTV.controller('tixatiCtrl', ['Tixati', 'SettingsService', 'FormlyLoader',
  function(Tixati, SettingsService, FormlyLoader) {
    var vm = this
    vm.error = null

    FormlyLoader.load('TorrentClientSettings').then(function(fields) {
      vm.model = {
        server: SettingsService.get('tixati.server'),
        port: SettingsService.get('tixati.port'),
        use_auth: SettingsService.get('tixati.use_auth'),
        username: SettingsService.get('tixati.username'),
        password: SettingsService.get('tixati.password'),
        hideUseAuth: true
      }

      vm.fields = fields
    })

    vm.isConnected = function() {
      return Tixati.isConnected()
    }

    vm.test = function() {
      vm.error = false
      // console.log("Testing settings");
      Tixati.Disconnect()
      Tixati.setConfig(vm.model)
      Tixati.connect().then(function(connected) {
        console.info('Tixati connected! (save settings)', connected)
        vm.error = null
        Tixati.saveConfig()
        window.location.reload()
      }, function(error) {
        if ('status' in error && 'statusText' in error) {
          vm.error = ['Tixati connect error!', 'Status:', error.status, 'Reason:', error.statusText || 'Unknown'].join(' ')
        } else {
          vm.error = error
        }
        console.error(vm.error)
      })
    }
  }
])
;
DuckieTV.controller('tbtCtrl', ['Transmission', 'SettingsService', 'FormlyLoader',
  function(Transmission, SettingsService, FormlyLoader) {
    var vm = this
    vm.error = null

    FormlyLoader.load('TorrentClientSettings').then(function(fields) {
      vm.model = {
        server: SettingsService.get('transmission.server'),
        port: SettingsService.get('transmission.port'),
        path: SettingsService.get('transmission.path'),
        use_auth: SettingsService.get('transmission.use_auth'),
        username: SettingsService.get('transmission.username'),
        password: SettingsService.get('transmission.password'),
        progressX100: SettingsService.get('transmission.progressX100')
      }

      vm.fields = fields
    })

    vm.isConnected = function() {
      return Transmission.isConnected()
    }

    vm.test = function() {
      vm.error = false
      // console.log("Testing settings");
      Transmission.Disconnect()
      Transmission.setConfig(vm.model)
      Transmission.connect().then(function(connected) {
        console.info('Transmission connected! (save settings)', connected)
        vm.error = null
        Transmission.saveConfig()
        window.location.reload()
      }, function(error) {
        vm.error = error
        console.error('Transmission connect error!', error)
      })
    }
  }
])
;
DuckieTV.controller('tTorrentCtrl', ['tTorrent', 'SettingsService', 'FormlyLoader',
  function(tTorrent, SettingsService, FormlyLoader) {
    var vm = this
    vm.error = null

    FormlyLoader.load('TorrentClientSettings').then(function(fields) {
      vm.model = {
        server: SettingsService.get('ttorrent.server'),
        port: SettingsService.get('ttorrent.port'),
        use_auth: SettingsService.get('ttorrent.use_auth'),
        username: SettingsService.get('ttorrent.username'),
        password: SettingsService.get('ttorrent.password'),
        hideUseAuth: false
      }

      vm.fields = fields
    })

    vm.isConnected = function() {
      return tTorrent.isConnected()
    }

    vm.test = function() {
      vm.error = false
      tTorrent.Disconnect()
      tTorrent.setConfig(vm.model)
      tTorrent.connect().then(function(connected) {
        console.info('tTorrent  connected! (save settings)', connected)
        vm.error = null
        tTorrent.saveConfig()
        window.location.reload()
      }, function(error) {
        vm.error = error
        console.error('tTorrent  connect error!', error)
      })
    }
  }
])
;
DuckieTV.controller('uTorrentWebUICtrl', ['uTorrentWebUI', 'SettingsService', 'FormlyLoader',
  function(uTorrentWebUI, SettingsService, FormlyLoader) {
    var vm = this
    vm.error = null

    FormlyLoader.load('TorrentClientSettings').then(function(fields) {
      vm.model = {
        server: SettingsService.get('utorrentwebui.server'),
        port: SettingsService.get('utorrentwebui.port'),
        use_auth: SettingsService.get('utorrentwebui.use_auth'),
        username: SettingsService.get('utorrentwebui.username'),
        password: SettingsService.get('utorrentwebui.password'),
        hideUseAuth: true
      }

      vm.fields = fields
    })

    vm.isConnected = function() {
      return uTorrentWebUI.isConnected()
    }

    vm.test = function() {
      vm.error = false
      // console.log("Testing settings");
      uTorrentWebUI.Disconnect()
      uTorrentWebUI.setConfig(vm.model)
      uTorrentWebUI.connect().then(function(connected) {
        console.info('uTorrent WEBUI connected! (save settings)', connected)
        vm.error = null
        uTorrentWebUI.saveConfig()
        window.location.reload()
      }, function(error) {
        vm.error = error
        console.error('uTorrent WEBUI connect error!', error)
      })
    }
  }
])
;
DuckieTV.controller('vuzeCtrl', ['Vuze', 'SettingsService', 'FormlyLoader',
  function(Vuze, SettingsService, FormlyLoader) {
    var vm = this
    vm.error = null

    FormlyLoader.load('TorrentClientSettings').then(function(fields) {
      vm.model = {
        server: SettingsService.get('vuze.server'),
        port: SettingsService.get('vuze.port'),
        path: SettingsService.get('vuze.path'),
        use_auth: SettingsService.get('vuze.use_auth'),
        username: SettingsService.get('vuze.username'),
        password: SettingsService.get('vuze.password'),
        progressX100: SettingsService.get('vuze.progressX100'),
        hidePath: true
      }

      vm.fields = fields
    })

    vm.isConnected = function() {
      return Vuze.isConnected()
    }

    vm.test = function() {
      vm.error = false
      // console.log("Testing settings");
      Vuze.Disconnect()
      Vuze.setConfig(vm.model)
      Vuze.connect().then(function(connected) {
        console.info('Vuze connected! (save settings)', connected)
        vm.error = null
        Vuze.saveConfig()
        window.location.reload()
      }, function(error) {
        vm.error = error
        console.error('Vuze connect error!', error)
      })
    }
  }
])
;
/**
 * Fetches and displays various statistics about current DuckieTV Setup on About Page
 */
DuckieTV.controller('AboutCtrl', ['$scope', '$http', '$injector', 'SettingsService', 'StorageSyncService', 'TorrentSearchEngines', 'DuckieTorrent', 'AutoDownloadService',
  function($scope, $http, $injector, SettingsService, StorageSyncService, TorrentSearchEngines, DuckieTorrent, AutoDownloadService) {
    /**
     * Closes the SidePanel
     */
    $scope.closeSidePanel = function() {
      $injector.get('$state').go('calendar')
    }

    $scope.isStandalone = SettingsService.isStandalone()

    // If we load onto the page highlight the button
    document.querySelector('#actionbar_about').classList.add('active')

    $scope.statistics = []

    // defined by utility.js
    $scope.optInTrackingEnabled = localStorage.getItem('optin_error_reporting')
    $scope.uniqueTrackingID = localStorage.getItem('uniqueId')

    $scope.clearStatData = function(stat) {
      if (!stat || !stat.allowDelete || !stat.tableName) {
        return
      }

      if (!stat.clicked) {
        stat.clicked = true
        return
      }

      CRUD.executeQuery(`DELETE FROM ${stat.tableName}`).then(() => {
        stat.data = 0
        stat.clicked = false
        $scope.$digest()
      })
    }

    $scope.toggleOptInErrorReporting = function() {
      if (localStorage.getItem('optin_error_reporting')) {
        localStorage.removeItem('optin_error_reporting')
        localStorage.removeItem('optin_error_reporting.start_time')
        window.location.reload()
      } else {
        localStorage.setItem('optin_error_reporting', true)
        localStorage.setItem('optin_error_reporting.start_time', new Date().getTime())
        window.location.reload()
      }
    }

    $scope.copyStatsToClipboard = function() {
      var clip = nw.Clipboard.get()
      clip.set(angular.toJson($scope.statistics, true), 'text')
    }

    var getStats = function() {
      // Get Screen Size
      var screenSize = ''
      if (screen.width) {
        var width = (screen.width) ? screen.width : ''

        var height = (screen.height) ? screen.height : ''
        screenSize += '' + width + ' x ' + height
      }

      // Get Database Stats
      var countEntity = function(tableName, entityName, allowDelete) {
        CRUD.executeQuery('select count(*) as count from ' + tableName).then(function(result) {
          $scope.statistics.push({
            tableName: tableName,
            name: 'DB ' + (entityName || tableName),
            data: result.rows[0].count,
            allowDelete: allowDelete
          })
        })
      }

      // Count shows hidden from calendar
      var countHiddenShows = function() {
        CRUD.executeQuery('select count(displaycalendar) as count from Series where displaycalendar like 0').then(function(result) {
          $scope.statistics.push({
            name: 'DB Series Hidden From Calendar',
            data: result.rows[0].count
          })
        })
      }

      // Get sync stats
      // Unused
      var getSyncTime = function() {
        /*
        * if sync is supported get the synctime else indicate not available
        */
        if (StorageSyncService.isSupported()) {
          StorageSyncService.get('lastSync').then(function(syncTime) {
            if (syncTime !== null) {
              $scope.statistics.push({
                name: 'Storage Sync Last Synced on',
                data: new Date(syncTime).toGMTString()
              })
            } else {
              $scope.statistics.push({
                name: 'Storage Sync has',
                data: 'Never Signed in to Google'
              })
            }
          })
        } else {
          $scope.statistics.push({
            name: 'Storage Sync is',
            data: 'Not Available'
          })
        }
      }

      // Get default search engine and status
      var defaultSE = 'n/a'
      if (SettingsService.get('torrenting.enabled')) {
        var jackettProviders = TorrentSearchEngines.getJackettEngines()
        defaultSE = TorrentSearchEngines.getDefaultEngineName()
        var jackett = (defaultSE in jackettProviders && jackettProviders[defaultSE].enabled) ? ' [Jackett]' : ''
        defaultSE = [defaultSE, jackett, ' (Enabled)'].join('')
      } else {
        defaultSE = SettingsService.get('torrenting.searchprovider') + ' (Disabled)'
      }

      // Get default torrent client engine and connection to host status
      var defaultTC = 'n/a'
      if (SettingsService.get('torrenting.enabled')) {
        if (DuckieTorrent.getClient().isConnected()) {
          defaultTC = DuckieTorrent.getClient().getName() + ' (Enabled and Connected to Host)'
        } else {
          defaultTC = DuckieTorrent.getClient().getName() + ' (Enabled but Not Connected to Host)'
        }
      } else {
        defaultTC = SettingsService.get('torrenting.client') + ' (Disabled)'
      }

      // Get auto download service  status
      var autoDL = 'n/a'
      if (SettingsService.get('torrenting.enabled') && SettingsService.get('torrenting.autodownload')) {
        if (AutoDownloadService.checkTimeout) {
          autoDL = '(Enabled and Active)'
        } else {
          autoDL = '(Enabled but Inactive)'
        }
      } else {
        autoDL = '(Disabled)'
      }

      // Get date of last trakt update
      var lastUpdated = new Date(parseInt(localStorage.getItem('trakttv.lastupdated')))

      // General misc stats
      $scope.statistics = [{
        name: 'UserAgent',
        data: navigator.userAgent
      }, {
        name: 'Platform, Vendor',
        data: navigator.platform + ', ' + navigator.vendor
      }, {
        name: 'Screen (width x height)',
        data: screenSize
      }, {
        name: 'Default Search Engine',
        data: defaultSE
      }, {
        name: 'Default Torrent Client',
        data: defaultTC
      }, {
        name: 'Auto Download Service',
        data: autoDL
      }, {
        name: 'Last checked TraktTV for DB updates on',
        data: lastUpdated.toGMTString()
      }]

      // nwjs and chromium for standalone versions
      if ($scope.isStandalone) {
        $scope.statistics.unshift({
          name: 'NWJS, Chromium',
          data: process.versions['nw'] + ' , ' + process.versions['chromium']
        })
      }

      // DuckieTV version
      if ('chrome' in window && 'app' in window.chrome && 'getDetails' in window.chrome.app && window.chrome.app.getDetails() !== null && 'version' in window.chrome.app.getDetails()) {
        $scope.statistics.unshift({
          name: window.chrome.app.getDetails().name,
          data: window.chrome.app.getDetails().version
        })
      } else {
        $http.get('VERSION').then(function(data, status, headers, config) {
          $scope.statistics.unshift({
            name: 'DuckieTV Web Based',
            data: data.data
          })
        })
      }

      // Local date and time in GMT presentation
      $scope.statistics.unshift({
        name: 'Current Date and Time',
        data: new Date().toGMTString()
      })

      // getSyncTime();
      countEntity('Series')
      countHiddenShows()
      countEntity('Seasons')
      countEntity('Episodes')
      countEntity('Fanart', 'Fanart.TV (legacy)', true)
      countEntity('TMDBFanart', null, true)
      countEntity('Jackett')

      // dump filtered user preferences, redact passwords
      var userPrefs = angular.fromJson(localStorage.getItem('userPreferences'))
      var unwantedClientKeys = ['aria2', 'biglybt', 'deluge', 'ktorrent', 'qbittorrent', 'qbittorrent32plus', 'rtorrent', 'tixati', 'transmission', 'utorrent', 'utorrentwebui', 'vuze']
      var activeClientKey = localStorage.getItem('torrenting.client').replace(/ /g, '').replace('3.2+', '32plus').replace('(pre3.2)', '').toLowerCase()
      unwantedClientKeys.splice(unwantedClientKeys.indexOf(activeClientKey), 1) // drop active client from list
      Object.keys(userPrefs).map(function(key) {
        // redact passwords
        if (key.indexOf('password') > -1) {
          userPrefs[key] = '*****'
        }
        // reduce list by dropping inactive client keys
        unwantedClientKeys.map(function(unwantedClientKey) {
          if (key.indexOf(unwantedClientKey + '.') > -1) {
            delete userPrefs[key]
          }
        })
      })
      $scope.statistics.push({
        name: 'User Preferences on Local Storage',
        data: angular.toJson(userPrefs, true)
      })

      // dump filtered local storage to avoid overload.
      var dumpLocalStorage = JSON.parse(JSON.stringify(localStorage));
      ['userPreferences', 'torrenting.hashList', 'trakttv.token', 'trakttv.trending.cache', 'alarms', 'xem.mappings', 'xem.aliasmap', 'snr.name-exceptions', 'snr.date-exceptions', 'fanart.cache', 'jackett', 'trackers.fallBackList', 'snrt.date-exceptions', 'snrt.name-exceptions', 'snrt.traktid-tvdbid-xref'].map(function(key) {
        delete dumpLocalStorage[key]
      })
      $scope.statistics.push({
        name: 'Other significant Local Storage keys',
        data: JSON.stringify(dumpLocalStorage, null, '  ')
      })
    }
    getStats()
  }
])
;
/**
 * Displays status of Auto-Download activities
 */
DuckieTV.controller('AutodlstatusCtrl', ['$scope', '$filter', '$injector', 'SettingsService', 'AutoDownloadService', 'TorrentSearchEngines', 'DuckieTorrent',
  function($scope, $filter, $injector, SettingsService, AutoDownloadService, TorrentSearchEngines, DuckieTorrent) {
    /**
     * Closes the SidePanel
     */
    $scope.closeSidePanel = function() {
      $injector.get('$state').go('calendar')
    }

    // If we load onto the page highlight the button
    document.querySelector('#actionbar_autodlstatus').classList.add('active')

    // set up static translated labels
    $scope.period = SettingsService.get('autodownload.period')
    var timePlurals = $filter('translate')('TIMEPLURALS').split('|')
    // " day, | days, | hour and | hours and | minute | minutes "

    var statusCodes = $filter('translate')('STATUSCODES').split('|')
    // "downloaded|watched|has torrent|autoDL disabled|nothing found|filtered out|torrent launched|seeders |onair + delay"

    var inactiveLbl = $filter('translate')('AUTODLSTATUSCTRLjs/inactive/lbl')
    // inactive

    var activeLbl = $filter('translate')('AUTODLSTATUSCTRLjs/active/lbl')
    // active

    var usingLbl = $filter('translate')('AUTODLSTATUSCTRLjs/using/lbl')
    // using

    var notusingLbl = $filter('translate')('AUTODLSTATUSCTRLjs/not-using/lbl')
    // not using

    var csmLbl = $filter('translate')('COMMON/custom-search-size-min-max/lbl')
    // Custom Search Size Min/Max

    var csLbl = $filter('translate')('COMMON/custom-seeders/lbl')
    // Custom Seeders

    var ciLbl = $filter('translate')('COMMON/custom-includes/lbl')
    // Custom Includes

    var ceLbl = $filter('translate')('COMMON/custom-excludes/lbl')
    // Custom Excludes

    var cssLbl = $filter('translate')('COMMON/custom-search-string/lbl')
    // Custom Search String

    var pqLbl = $filter('translate')('COMMON/global-quality/hdr')
    // Preferred Quality

    var rkLbl = $filter('translate')('COMMON/require-keywords/hdr')
    // require keywords List

    var ikLbl = $filter('translate')('COMMON/ignore-keywords/hdr')
    // ignore keywords List

    var dayLbl = ($scope.period === 1) ? timePlurals[0].replace(',', '') : timePlurals[1].replace(',', '')
    $scope.onMagnet = []

    $scope.isActive = function() {
      return $scope.status == activeLbl
    }

    var getActivity = function() {
      var jackettProviders = TorrentSearchEngines.getJackettEngines()
      var defaultSE = TorrentSearchEngines.getDefaultEngineName()
      $scope.searchEngine = (defaultSE in jackettProviders && jackettProviders[defaultSE].enabled) ? defaultSE + ' [Jackett]' : SettingsService.get('torrenting.searchprovider')
      $scope.activityList = AutoDownloadService.activityList
      $scope.lastRun = SettingsService.get('autodownload.lastrun')
      if ($scope.isActive()) {
        $scope.nextRun = $scope.lastRun + (1000 * 60 * 15)
        $scope.fromDT = AutoDownloadService.fromDT
        $scope.toDT = AutoDownloadService.toDT
        /**
         * This watches for the torrent:select event that will be fired by the
         * TorrentSearchEngines when a user selects a magnet or .torrent link for an episode from the autoDLstatus side panel.
         */
        angular.forEach($scope.activityList, function(activity) {
          if (activity.status > 2) { // only interested in not-found, filtered-out, seeders-min, no-magnet
            var traktid = activity.episode.TRAKT_ID
            var episodeid = activity.episode.ID_Episode
            if ($scope.onMagnet.indexOf(traktid) == -1) { // don't set $on if we've already done it
              CRUD.FindOne('Episode', {'ID_Episode': episodeid}).then(function(episode) {
                if (!episode) {
                  console.warn('episode id=[%s] not found!', episodeid)
                } else {
                  $scope.$on('torrent:select:' + traktid, function(evt, magnet) {
                    episode.magnetHash = magnet
                    episode.downloaded = 0
                    episode.Persist()
                  })
                  $scope.onMagnet.push(traktid)
                }
              })
            }
          }
        })
      } else {
        $scope.nextRun = 'n/a'
        $scope.fromDT = 'n/a'
        $scope.toDT = 'n/a'
      }
    }

    // set up static scope data
    $scope.status = (AutoDownloadService.checkTimeout == null) ? inactiveLbl : activeLbl
    $scope.requireKeywords = SettingsService.get('torrenting.require_keywords')
    $scope.ignoreKeywords = SettingsService.get('torrenting.ignore_keywords')
    $scope.preferredQuality = (SettingsService.get('torrenting.searchquality') == '') ? 'All' : SettingsService.get('torrenting.searchquality')
    $scope.searchEngine = SettingsService.get('torrenting.searchprovider')
    $scope.globalSizeMax = SettingsService.get('torrenting.global_size_max')
    $scope.globalSizeMin = SettingsService.get('torrenting.global_size_min')
    $scope.period = $scope.period + ' ' + dayLbl
    $scope.minSeeders = SettingsService.get('torrenting.min_seeders')
    $scope.sortBy = ['-status', 'search']
    getActivity()

    // set up dynamic scope data
    $scope.$on('autodownload:activity', function(event) {
      var status = (DuckieTorrent.getClient().isConnected()) ? activeLbl : inactiveLbl
      $scope.status = (DuckieTorrent.getClient().isConnecting) ? activeLbl : status
      getActivity()
    })

    $scope.getTooltip = function(option, item) {
      switch (option) {
        case 'cs': return (item.cs == 0) ? notusingLbl + ' ' + csLbl : usingLbl + ' ' + csLbl + ' [' + item.serie.customSeeders + ']'
        case 'ci': return (item.ci == 0) ? notusingLbl + ' ' + ciLbl : usingLbl + ' ' + ciLbl + ' {' + item.serie.customIncludes + '}'
        case 'ce': return (item.ce == 0) ? notusingLbl + ' ' + ceLbl : usingLbl + ' ' + ceLbl + ' <' + item.serie.customExcludes + '>'
        case 'csm': return (item.csm == 0) ? notusingLbl + ' ' + csmLbl : usingLbl + ' ' + csmLbl + ' (' + (item.serie.customSearchSizeMin == null ? '-' : item.serie.customSearchSizeMin) + '/' + (item.serie.customSearchSizeMax == null ? '-' : item.serie.customSearchSizeMax) + ')'
        case 'css': return (item.css == 0) ? notusingLbl + ' ' + cssLbl : usingLbl + ' ' + cssLbl + ' (' + item.serie.customSearchString + ')'
        case 'ipq': return (item.ipq == 0) ? usingLbl + ' ' + pqLbl : notusingLbl + ' ' + pqLbl
        case 'irk': return (item.irk == 0) ? usingLbl + ' ' + rkLbl : notusingLbl + ' ' + rkLbl
        case 'iik': return (item.iik == 0) ? usingLbl + ' ' + ikLbl : notusingLbl + ' ' + ikLbl
      }
    }

    $scope.getTorrentClientNameAndStatus = function() {
      var status = (DuckieTorrent.getClient().isConnected()) ? $filter('translate')('COMMON/tc-connected/lbl') : $filter('translate')('COMMON/tc-offline/lbl')
      status = (DuckieTorrent.getClient().isConnecting) ? $filter('translate')('COMMON/tc-connecting/lbl') : status
      return $filter('translate')('AUTODLSTATUSCTRLjs/no-activity/lbl') + DuckieTorrent.getClient().getName().split(' ')[0].toLowerCase() + ' ' + status
    }

    $scope.getStatusCode = function(code, extra) {
      extra = typeof (extra) === 'undefined' ? '' : extra
      if (statusCodes.length - 1 >= code) {
        return statusCodes[code] + extra
      } else {
        return 'n/a ' + extra
      }
    }
  }
])
;
/**
 * Controller for the Settings window
 */
DuckieTV.controller('SettingsCtrl', ['$scope', '$injector',
  function($scope, $injector) {
    /**
     * Closes the SidePanel
     */
    $scope.closeSidePanel = function() {
      $injector.get('$state').go('calendar')
    }
  }
])
;
DuckieTV.controller('SidepanelEpisodeCtrl', ['serie', 'episode', 'season', 'AutoDownloadService', 'SubtitleDialog', 'DuckieTorrent', 'dialogs', '$scope', '$injector', 'SettingsService', '$state',
  function(serie, episode, season, AutoDownloadService, SubtitleDialog, DuckieTorrent, dialogs, $scope, $injector, SettingsService, $state) {
    var vm = this
    vm.serie = serie
    vm.episode = episode
    vm.season = season

    /**
     * Closes the SidePanel
     */
    vm.closeSidePanel = function() {
      $injector.get('$state').go('calendar')
    }

    vm.markLeaked = function() {
      vm.episode.leaked = 1
      vm.episode.Persist()
    }

    var gotoFirstUnwatchedSeason = SettingsService.get('series.not-watched-eps-btn')
    vm.gotoEpisodes = function() {
      var getSeasonFunc = gotoFirstUnwatchedSeason ? serie.getNotWatchedSeason() : serie.getActiveSeason()

      getSeasonFunc.then(function(result) {
        $state.go('serie.season', {
          id: serie.ID_Serie,
          season_id: result.ID_Season
        })
      })
    }

    vm.autoDownload = function() {
      AutoDownloadService.autoDownload(vm.serie, vm.episode)
    }

    vm.torrentSettings = function() {
      var d = dialogs.create('templates/settings/serieSettings.html', 'serieSettingsCtrl', {
        serie: vm.serie
      }, {
        bindToController: true,
        size: 'xs'
      })

      d.result.then(function() {
        d = undefined
      }, function() {
        d = undefined
      })
    }

    vm.getSearchString = function(serie, episode) {
      if (!serie || !episode) return
      return serie.name + ' ' + episode.getFormattedEpisode()
    }

    vm.isTorrentClientConnected = function() {
      return DuckieTorrent.getClient().getRemote().isConnected()
    }

    vm.findSubtitle = function() {
      SubtitleDialog.searchEpisode(vm.serie, vm.episode)
    }

    /**
     * This watches for the torrent:select event that will be fired by the
     * TorrentSearchEngines when a user selects a magnet or .torrent link for an episode.
     */
    $scope.$on('torrent:select:' + vm.episode.TRAKT_ID, function(evt, magnet) {
      vm.episode.magnetHash = magnet
      vm.episode.downloaded = 0
      vm.episode.Persist()
    })
  }
])
;
/**
 * Controller for individual season view (episodes view)
 */
DuckieTV.controller('SidepanelSeasonCtrl', ['$rootScope', '$scope', '$state', '$filter', '$injector', 'seasons', 'season', 'episodes', 'SceneNameResolver', 'AutoDownloadService', 'SettingsService',
  function($rootScope, $scope, $state, $filter, $injector, seasons, season, episodes, SceneNameResolver, AutoDownloadService, SettingsService) {
    var vm = this
    vm.season = season
    vm.seasons = seasons
    vm.episodes = episodes
    vm.seasonIndex = null
    vm.watchedDownloadedPaired = SettingsService.get('episode.watched-downloaded.pairing')

    /**
     * Closes the SidePanel expansion
     */
    vm.closeSidePanelExpansion = function() {
      $injector.get('SidePanelState').contract()
      $state.go('serie')
    }

    // Find the current Season Index relative to all Seasons
    for (var i = 0; i < vm.seasons.length; i++) {
      if (vm.seasons[i].ID_Season == vm.season.ID_Season) {
        vm.seasonIndex = i
      }
    }

    vm.gotoPreviousSeason = function() {
      // If we're on the last season or specials
      if (vm.seasonIndex === vm.seasons.length - 1) {
        return
      } else {
        $state.go('serie.season', {
          'season_id': seasons[vm.seasonIndex + 1].ID_Season
        })
      }
    }

    vm.gotoFirstSeason = function() {
      $state.go('serie.season', {
        'season_id': seasons[vm.seasons.length - 1].ID_Season
      })
    }

    vm.gotoNextSeason = function() {
      // Seasons are sorted by latest to oldest therefore 0 should always the be latest.
      if (vm.seasonIndex === 0) {
        return
      } else {
        $state.go('serie.season', {
          'season_id': seasons[vm.seasonIndex - 1].ID_Season
        })
      }
    }

    vm.gotoLastSeason = function() {
      $state.go('serie.season', {
        'season_id': seasons[0].ID_Season
      })
    }

    vm.episodes.map(function(episode) {
      /**
       * This watches for the torrent:select event that will be fired by the
       * TorrentSearchEngines when a user selects a magnet or .torrent link for an episode.
       */
      $scope.$on('torrent:select:' + episode.TRAKT_ID, function(evt, magnet) {
        episode.magnetHash = magnet
        episode.downloaded = 0
        episode.Persist()
      })
    })

    // Return 'Specials' header if current season is Specials.
    vm.getPageHeader = function(season) {
      if (!season) return ''
      return season.seasonnumber === 0 ? $filter('translate')('COMMON/specials/lbl') : $filter('translate')('COMMON/season/lbl') + ' ' + season.seasonnumber
    }

    vm.getSortEpisodeNumber = function(episode) {
      var sn = episode.seasonnumber.toString()
      var en = episode.episodenumber.toString()

      var out = ['S', sn.length === 1 ? '0' + sn : sn, 'E', en.length === 1 ? '000' + en : en.length === 2 ? '00' + en : en.length === 3 ? '0' + en : en].join('')
      return out
    }

    vm.autoDownload = function(serie, episode) {
      if (!episode.isDownloaded() && episode.hasAired()) {
        AutoDownloadService.autoDownload(serie, episode)
      }
    }

    vm.autoDownloadAll = function() {
      var clickList = Array.from(document.querySelectorAll('.rightpanel .auto-download-episode'))
      clickList.reverse().map(function(el, idx) {
        setTimeout(function() {
          el.click()
        }, (idx + 1) * 100) // a setTimeout with 0ms (first element index of 0 times 100) seems to result in the first click to not fire,so we bump idx up by 1
      })
    }

    vm.markAllWatched = function() {
      vm.season.markSeasonAsWatched(vm.watchedDownloadedPaired, $rootScope).then(function() {
        $rootScope.$broadcast('serie:recount:watched', season.ID_Serie)
      })
    }

    vm.markAllDownloaded = function(episodes) {
      episodes.map(function(episode) {
        if ((episode.hasAired()) && (!episode.isDownloaded())) {
          episode.markDownloaded($rootScope)
        }
      })
    }

    vm.getSearchString = function(serie, episode) {
      if (!serie || !episode) return
      return serie.name + ' ' + episode.getFormattedEpisode()
    }

    vm.getSeasonSearchString = function(serie, season) {
      if (!serie || !season) return
      return SceneNameResolver.getSceneName(serie.TRAKT_ID, serie.name) + ' season ' + season.seasonnumber
    }

    vm.getEpisodeNumber = function(episode) {
      var sn = episode.seasonnumber.toString()

      var en = episode.episodenumber.toString()

      var out = ['s', sn.length == 1 ? '0' + sn : sn, 'e', en.length == 1 ? '0' + en : en].join('')
      return out
    }

    // Ratings graph
    vm.points = []
    var data = $filter('orderBy')(vm.episodes, vm.getEpisodeNumber, false) // sort episodes by episode number
    data.map(function(episode) {
      vm.points.push({
        y: episode.rating,
        label: vm.getEpisodeNumber(episode) + ' : ' + episode.rating + '% (' + episode.ratingcount + ' ' + $filter('translate')('COMMON/votes/lbl') + ')',
        season: parseInt(episode.seasonnumber, 10)
      })
    })
  }
])
;
/**
 * Controller for all seasons view
 */
DuckieTV.controller('SidepanelSeasonsCtrl', ['$rootScope', '$filter', 'seasons', 'SidePanelState', 'SettingsService',
  function($rootScope, $filter, seasons, SidePanelState, SettingsService) {
    var vm = this
    vm.seasons = seasons
    vm.markAllWatchedAlert = false
    vm.watchedDownloadedPaired = SettingsService.get('episode.watched-downloaded.pairing')

    // Closes the SidePanel expansion
    vm.closeSidePanelExpansion = function() {
      SidePanelState.contract()
    }

    vm.markAllWatched = function() {
      vm.seasons.map(function(season) {
        season.markSeasonAsWatched(vm.watchedDownloadedPaired, $rootScope).then(function() {
          $rootScope.$broadcast('serie:recount:watched', season.ID_Serie)
          vm.markAllWatchedAlert = false // reset alert flag
        })
      })
    }

    vm.markAllWatchedCancel = function() {
      vm.markAllWatchedAlert = false // reset alert flag
    }

    vm.markAllWatchedQuery = function() {
      vm.markAllWatchedAlert = true // set alert flag
    }

    vm.getPosterLabel = function(seasonNumber) {
      return seasonNumber === 0 ? $filter('translate')('COMMON/specials/lbl') : $filter('translate')('COMMON/season/lbl') + ' ' + seasonNumber
    }
  }
])
;
DuckieTV.controller('sidepanelTraktSerieCtrl', ['serie', 'SidePanelState', 'FavoritesManager', '$state', 'SeriesMetaTranslations',
  function(serie, SidePanelState, FavoritesManager, $state, SeriesMetaTranslations) {
    var vm = this

    vm.serie = serie
    vm.translateGenre = SeriesMetaTranslations.translateGenre
    vm.translateStatus = SeriesMetaTranslations.translateStatus
    vm.translateDayOfWeek = SeriesMetaTranslations.translateDayOfWeek

    // Takes a rating (8.12345) and converts it percentage presentation (81)
    vm.ratingPercentage = function(rating) {
      return Math.round(rating * 10)
    }

    // Closes the trakt-serie-details sidepanel
    vm.closeSidePanel = function() {
      SidePanelState.hide()
    }

    // Add to favorites, navigate to the show details
    vm.selectSerie = function() {
      return FavoritesManager.add(vm.serie).then(function() {
        $state.go('serie', {
          id: FavoritesManager.getByTrakt_id(vm.serie.trakt_id).ID_Serie
        })
      })
    }
  }
])
;
DuckieTV.controller('SidepanelSerieCtrl', ['$rootScope', '$filter', '$state', '$injector', 'dialogs', 'FavoritesService', 'serie', 'SidePanelState', 'SettingsService', 'FavoritesManager', 'SeriesMetaTranslations',
  function($rootScope, $filter, $state, $injector, dialogs, FavoritesService, serie, SidePanelState, SettingsService, FavoritesManager, SeriesMetaTranslations) {
    var vm = this
    vm.serie = serie
    vm.watchedDownloadedPaired = SettingsService.get('episode.watched-downloaded.pairing')
    vm.isRefreshing = false
    vm.markAllWatchedAlert = false
    vm.translateGenre = SeriesMetaTranslations.translateGenre
    vm.translateStatus = SeriesMetaTranslations.translateStatus
    vm.translateDayOfWeek = SeriesMetaTranslations.translateDayOfWeek

    // Closes the SidePanel expansion
    vm.closeSidePanel = function() {
      SidePanelState.hide()
    }

    // Closes the SidePanel expansion
    vm.closeSidePanelExpansion = function() {
      $injector.get('SidePanelState').contract()
      $state.go('serie')
    }

    vm.refresh = function(serie) {
      vm.isRefreshing = true
      console.log('[SerieRefresh] [TRAKT_ID=' + serie.TRAKT_ID + ']', 'updating', serie.name)
      return FavoritesManager.refresh(serie.TRAKT_ID).then(function() {
        vm.isRefreshing = false
        $rootScope.$applyAsync()
      })
    }

    var timePlurals = $filter('translate')('TIMEPLURALS').split('|') // " day, | days, | hour and | hours and | minute | minutes "
    vm.totalRunTime = null
    vm.totalRunLbl = null
    CRUD.executeQuery('select count(ID_Episode) as amount from Episodes where seasonnumber > 0 AND firstaired > 0 AND firstaired < ? AND ID_Serie = ? group by episodes.ID_Serie', [new Date().getTime(), vm.serie.ID_Serie]).then(function(result) {
      if (result.rows.length > 0) {
        vm.totalRunTime = result.rows[0].amount * vm.serie.runtime
        var totalRunDays = Math.floor(vm.totalRunTime / 60 / 24)
        var totalRunHours = Math.floor((vm.totalRunTime % (60 * 24)) / 60)
        var totalRunMinutes = vm.totalRunTime % 60
        var dayLbl = (totalRunDays === 1) ? timePlurals[0] : timePlurals[1]
        var hourLbl = (totalRunHours === 1) ? timePlurals[2] : timePlurals[3]
        var minuteLbl = (totalRunMinutes === 1) ? timePlurals[4] : timePlurals[5]
        vm.totalRunLbl = ((totalRunDays > 0) ? (totalRunDays.toString() + dayLbl) : '') + totalRunHours.toString() + hourLbl + totalRunMinutes.toString() + minuteLbl
      } else {
        vm.totalRunTime = 1
        vm.totalRunLbl = '0' + timePlurals[1] + '0' + timePlurals[3] + '0' + timePlurals[5]
      }
      return true
    }).then(function() {
      CRUD.executeQuery('select count(ID_Episode) as amount from Episodes where seasonnumber > 0 AND firstaired > 0 AND firstaired < ? AND ID_Serie = ? AND watched = 1 group by episodes.ID_Serie', [new Date().getTime(), vm.serie.ID_Serie]).then(function(result) {
        if (result.rows.length > 0) {
          vm.totalWatchedTime = result.rows[0].amount * vm.serie.runtime
          var totalRunDays = Math.floor(vm.totalWatchedTime / 60 / 24)
          var totalRunHours = Math.floor((vm.totalWatchedTime % (60 * 24)) / 60)
          var totalRunMinutes = vm.totalWatchedTime % 60
          var dayLbl = (totalRunDays === 1) ? timePlurals[0] : timePlurals[1]
          var hourLbl = (totalRunHours === 1) ? timePlurals[2] : timePlurals[3]
          var minuteLbl = (totalRunMinutes === 1) ? timePlurals[4] : timePlurals[5]
          vm.totalWatchedLbl = ((totalRunDays > 0) ? totalRunDays.toString() + dayLbl : '') + ((totalRunHours > 0) ? totalRunHours.toString() + hourLbl : '') + totalRunMinutes.toString() + minuteLbl
          vm.totalWatchedPercent = $filter('number')(vm.totalWatchedTime / vm.totalRunTime * 100, 2)
        } else {
          vm.totalWatchedTime = 1
          vm.totalWatchedLbl = '0' + timePlurals[1] + '0' + timePlurals[3] + '0' + timePlurals[5]
          vm.totalWatchedPercent = 0
        }
        $rootScope.$applyAsync()
      })
    })

    vm.nextEpisode = null
    vm.prevEpisode = null

    serie.getLastEpisode().then(function(result) {
      vm.prevEpisode = result
      $rootScope.$applyAsync()
    })

    serie.getNextEpisode().then(function(result) {
      vm.nextEpisode = result
      $rootScope.$applyAsync()
    })

    var gotoFirstUnwatchedSeason = SettingsService.get('series.not-watched-eps-btn')
    vm.gotoEpisodes = function() {
      var getSeasonFunc = gotoFirstUnwatchedSeason ? serie.getNotWatchedSeason() : serie.getActiveSeason()

      getSeasonFunc.then(function(result) {
        $state.go('serie.season', {
          id: serie.ID_Serie,
          season_id: result.ID_Season
        })
      })
    }

    vm.markAllWatched = function(serie) {
      serie.markSerieAsWatched(vm.watchedDownloadedPaired, $rootScope).then(function() {
        $rootScope.$broadcast('serie:recount:watched', serie.ID_Serie)
        vm.markAllWatchedAlert = false // reset alert flag
      })
    }

    vm.markAllWatchedCancel = function() {
      vm.markAllWatchedAlert = false // reset alert flag
    }

    vm.markAllWatchedQuery = function() {
      vm.markAllWatchedAlert = true // set alert flag
    }

    vm.torrentSettings = function() {
      var d = dialogs.create('templates/settings/serieSettings.html', 'serieSettingsCtrl', {
        serie: vm.serie
      }, {
        bindToController: true,
        size: 'xs'
      })

      d.result.then(function() {
        // console.debug('Success');
        d = undefined
      }, function() {
        // console.debug('Cancelled');
        d = undefined
      })
    }

    vm.removeFromFavorites = function() {
      FavoritesManager.remove(vm.serie).then(function() {
        SidePanelState.hide()
      })
    }

    /**
     * Returns true as long as the add a show to favorites promise is running.
     */
    vm.isAdding = function(trakt_id) {
      return FavoritesService.isAdding(trakt_id)
    }

    vm.dataToClipboard = function(data) {
      var clip = nw.Clipboard.get()
      clip.set(data.replace(/\|/g, '\r\n'), 'text')
    }
  }
])
;
/**
 * Synology DS-Video main control interface
 * Lists devices and library and control options
 */
DuckieTV.controller('SynologyDSVideoCtrl', ['SynologyAPI',
  function(SynologyAPI) {
    var vm = this

    vm.library = null
    vm.devices = null
    vm.folders = null

    SynologyAPI.Library().then(function(library) {
      vm.library = library
    })

    SynologyAPI.DeviceList().then(function(devices) {
      vm.devices = devices
    })

    SynologyAPI.Folder().then(function(folders) {
      vm.folders = folders
    })

    vm.play = function(file) {
      SynologyAPI.PlayFile(file, vm.devices[0])
    }

    vm.getFilesForFolder = function(folder) {
      return SynologyAPI.Folder({
        id: folder.id
      }).then(function(result) {
        folder.files = result
        return folder
      })
    }
  }
])
;
/**
 * Torrent Control for the torrenting window
 */
DuckieTV.controller('TorrentCtrl', ['$rootScope', '$injector', '$filter', 'DuckieTorrent', 'SidePanelState',
  function($rootScope, $injector, $filter, DuckieTorrent, SidePanelState) {
    var vm = this
    var connectedLbl = $filter('translate')('COMMON/tc-connected/lbl')
    var connectingLbl = $filter('translate')('COMMON/tc-connecting/lbl') + '...'

    /**
     * Closes the SidePanel
     */
    vm.closeSidePanel = function() {
      $injector.get('$state').go('calendar')
    }

    vm.authToken = localStorage.getItem('utorrent.token')
    // uTorrent.setPort(localStorage.getItem('utorrent.port'));
    vm.rpc = null
    vm.status = connectingLbl

    vm.removeToken = function() {
      localStorage.removeItem('utorrent.token')
      localStorage.removeItem('utorrent.preventconnecting')
      window.location.reload()
    }

    vm.getTorrentClientName = function() {
      return DuckieTorrent.getClientName()
    }

    vm.getTorrentClientTemplate = function() {
      return DuckieTorrent.getClientName().toLowerCase().replace(/ /g, '').replace('(pre3.2)', 'Pre32').replace(/3.2\+/, '32plus')
    }

    vm.getTorrentsCount = function() {
      if (vm.rpc) {
        var count = vm.rpc.getTorrents().length
        if (SidePanelState.state.isExpanded && count === 0) {
          setTimeout(function() {
            if (document.getElementById('getTorrentsCount') && document.getElementById('getTorrentsCount').offsetParent !== null) {
              SidePanelState.contract()
            }
          }, 1000)
        }
        return count
      } else {
        return 0
      }
    }

    var autoConnectPoll = function() {
      vm.status = connectingLbl
      $rootScope.$applyAsync()
      DuckieTorrent.getClient().offline = false
      DuckieTorrent.getClient().AutoConnect().then(function(rpc) {
        vm.status = connectedLbl
        vm.rpc = rpc
        $rootScope.$applyAsync()
      })
    }

    $rootScope.$on('torrentclient:connected', function(remote) {
      autoConnectPoll()
    })

    autoConnectPoll()
  }
])
;
/**
 *
 */
DuckieTV.controller('TorrentDetailsCtrl', ['DuckieTorrent', 'torrent', '$scope', '$injector',
  function(DuckieTorrent, torrent, $scope, $injector) {
    var vm = this

    vm.torrent = torrent
    if ('hash' in torrent && torrent.hash !== undefined) {
      vm.infoHash = torrent.hash.toUpperCase()
    }
    vm.progress = 0
    vm.downloadSpeed = 0
    vm.isWebUI = (vm.torrent instanceof TorrentData) // web or uTorrent?

    /**
         * Closes the SidePanel expansion
         */
    vm.closeSidePanelExpansion = function() {
      $injector.get('SidePanelState').contract()
      $injector.get('$state').go('torrent')
    }

    /**
         * Observes the torrent and watches for changes (progress)
         */
    function observeTorrent(rpc, infoHash) {
      DuckieTorrent.getClient().getRemote().onTorrentUpdate(infoHash, function(newData) {
        vm.torrent = newData
        vm.torrent.getFiles().then(function(files) {
          if (!files) {
            return []
          } else {
            // console.debug('received files!', files);
            vm.torrent.torrent_files = files.map(function(file) {
              file.isMovie = file.name.substring(file.name.length - 3).match(/mp4|avi|mkv|mpeg|mpg|flv|ts/g)
              if (file.isMovie) {
                file.searchFileName = file.name.indexOf('/') > -1 ? file.name.split('/').pop().split(' ').pop() : file.name
                file.path = vm.torrent.getDownloadDir()
              }
              return file
            })
          }
        })
        vm.progress = vm.torrent.getProgress()
        vm.downloadSpeed = Math.floor((vm.torrent.getDownloadSpeed() / 1000) * 10) / 10 // B/s -> kB/s
        vm.isWebUI = (vm.torrent instanceof TorrentData) // web or uTorrent?
        $scope.$applyAsync()
      })
    }

    // If the connected info hash changes, remove the old event and start observing the new one.
    $scope.$watch('infoHash', function(newVal, oldVal) {
      if (newVal == oldVal) return
      vm.infoHash = newVal
      DuckieTorrent.getClient().AutoConnect().then(function(rpc) {
        vm.torrent = DuckieTorrent.getClient().getRemote().getByHash(vm.infoHash)
        DuckieTorrent.getClient().getRemote().offTorrentUpdate(oldVal, observeTorrent)
        observeTorrent(rpc, vm.infoHash)
      })
    })

    /**
         * start monitoring updates for the torrent hash in the infoHash
         */
    DuckieTorrent.getClient().AutoConnect().then(function(rpc) {
      vm.torrent = DuckieTorrent.getClient().getRemote().getByHash(vm.infoHash)
      observeTorrent(rpc, vm.infoHash)
    })
  }
])
;
DuckieTV.directive('actionBar', function() {
  return {
    restrict: 'E',
    templateUrl: 'templates/actionBar.html',
    controllerAs: 'actionbar',
    controller: ['$rootScope', '$state', '$filter', 'SeriesListState', 'SeriesAddingState', 'SidePanelState', 'DuckieTorrent', 'SettingsService',
      function($rootScope, $state, $filter, SeriesListState, SeriesAddingState, SidePanelState, DuckieTorrent, SettingsService) {
        if (SettingsService.isStandalone()) {
          // listen for standalone menu go-to events
          $rootScope.$on('standalone.calendar', function() {
            $state.go('calendar')
          })
          $rootScope.$on('standalone.favorites', function() {
            $state.go('favorites')
          })
          $rootScope.$on('standalone.adlstatus', function() {
            $state.go('autodlstatus')
          })
          $rootScope.$on('standalone.settings', function() {
            $state.go('settings')
          })
          $rootScope.$on('standalone.about', function() {
            $state.go('about')
          })
        }

        // Resets calendar to current date
        this.resetCalendar = function() {
          $rootScope.$broadcast('calendar:setdate', new Date())
        }

        /**
                 * SeriesList state needs to be managed manually because it is stickied and navigating away from
                 * it doesn't actually close the state so reponing it doesn't refire it's resolves.
                 */
        this.toggleSeriesList = function() {
          if (!$state.is('favorites')) {
            $state.go('favorites', {
              refresh: new Date().getTime()
            })
            SeriesListState.show()
            SeriesAddingState.hide()
          } else {
            $state.go('calendar')
          }
          $rootScope.$applyAsync()
        }

        /**
                 * SeriesList state needs to be managed manually because it is stickied and navigating away from
                 * it doesn't actually close the state so reponing it doesn't refire it's resolves.
                 */
        this.toggleAddingList = function() {
          if (!$state.is('add_favorites')) {
            $state.go('add_favorites', {
              refresh: new Date().getTime()
            })
            SeriesListState.hide()
            SeriesAddingState.show()
          } else {
            $state.go('calendar')
          }
          $rootScope.$applyAsync()
        }

        // for android platform {phonegap}
        this.closeApp = function() {
          if ('app' in navigator && 'exitApp' in navigator.app) {
            navigator.app.exitApp()
          } else if ('device' in navigator && 'exitApp' in navigator.device) {
            navigator.device.exitApp()
          } else {
            window.close()
          }
        }

        // Used by Settings to button
        this.contractSidePanel = function() {
          SidePanelState.show()
          SidePanelState.contract()
        }

        // Tooltips
        this.libraryHide = function() {
          return $filter('translate')('TAB/library-hide/glyph')
        }
        this.libraryShow = function() {
          return $filter('translate')('TAB/library-show/glyph')
        }
        this.tcConnecting = function() {
          return ': ' + $filter('translate')('COMMON/tc-connecting/lbl')
        }
        this.tcConnected = function() {
          return ': ' + $filter('translate')('COMMON/tc-connected/lbl')
        }
        this.tcOffline = function() {
          return ': ' + $filter('translate')('COMMON/tc-offline/lbl')
        }

        this.getHeartTooltip = function() {
          return SeriesListState.state.isShowing ? this.libraryHide() : this.libraryShow()
        }

        this.getTorrentClientTooltip = function() {
          var output = DuckieTorrent.getClient().getName()
          if (this.isTorrentClientConnecting()) return output + this.tcConnecting()
          return (this.isTorrentClientConnected()) ? output + this.tcConnected() : output + this.tcOffline()
        }

        this.getTorrentClientClass = function() {
          return DuckieTorrent.getClient().getName().split(' ')[0].toLowerCase()
        }

        this.isTorrentClientConnected = function() {
          return DuckieTorrent.getClient().isConnected()
        }
        this.isTorrentClientConnecting = function() {
          return DuckieTorrent.getClient().isConnecting
        }
      }
    ]
  }
})
;
/**
 * A <background-rotator channel="'event:channel'"> directive.
 * Usage:
 * Put <background-rotator tag anywhere with a channel parameter
 * directive waits until a new event has been broadcasted with the full url to an image
 * preloads new image
 * Cross-fades between current loaded image and the new image
 */
DuckieTV.directive('backgroundRotator', ['$rootScope',
  function($rootScope) {
    return {
      restrict: 'E',
      scope: {
        channel: '='
      },
      templateUrl: 'templates/backgroundRotator.html',
      link: function($scope) {
        $scope.format = ('chrome' in window) ? 'webp' : 'png'
        $scope.bg1 = false
        $scope.bg2 = false
        $scope.bg1on = false
        $scope.bg2on = false
        var cooldown = false

        load = function(url) {
          var img = document.createElement('img')
          img.onload = function() {
            var target = $scope.bg1on ? 'bg2' : 'bg1'
            $scope[target] = img.src
            $scope[target + 'on'] = true
            $scope[(target == 'bg1' ? 'bg2on' : 'bg1on')] = false
            $scope.$applyAsync()
          }
          img.src = url
        }

        $rootScope.$on($scope.channel, function(event, url) {
          if (!cooldown) {
            if (url) load(url)
            cooldown = true
            setTimeout(function() { cooldown = false }, 1300)
          }
        })
      }
    }
  }
])

  .directive('kc', ['$document', 'SettingsService',
    function($document, SettingsService) {
      return {
        link: function(scope) {
          var kk = [38, 38, 40, 40, 37, 39, 37, 39, 66, 65]

          var k = 0

          var handler = function(e) {
            if (e.keyCode === kk[k++]) {
              if (k === kk.length) {
                document.body.classList.add('kc')
                enableEgg()
              }
            } else {
              k = 0
            }
          }
          $document.on('keydown', handler)
          if (SettingsService.get('kc.always')) {
            document.body.classList.add('kc')
          }

          var zz = 0

          magic = function(o, t) {
            return Math.floor(Math.random() * (t - o + 1)) + o
          }
          enableEgg = function() {
            angular.element(document.body).append('<div class="contaner">')
            snow = function() {
              column = magic(0, $document[0].body.offsetWidth)
              if ($document[0].body.offsetWidth / 90 * 1.3 > zz) {
                zz++
                angular.element(document.querySelector('.contaner')).append('<div class="duckie" style="left:' + column + 'px;"><img src="img/logo/icon64-inverted.png"/>')
              } else {
                clearInterval(eggTimer)
              }
            }
            eggTimer = setInterval(function() {
              snow()
            }, 200)
          }
        }
      }
    }
  ])
;
/**
 * The <calendar> directive is just a little wrapper around the 3rd party datePicker directive
 * that provides the calendar basics.
 *
 * It sets up the defaults and initializes the calendar.
 */
DuckieTV.directive('calendar', function() {
  return {
    restrict: 'E',
    template: function(element, attrs) {
      return '<div date-picker ' +
                (attrs.eventService ? 'event-service="' + attrs.eventService + '"' : '') +
                (attrs.view ? 'view="' + attrs.view + '" ' : 'view="week"') +
                (attrs.template ? 'template="' + attrs.template + '" ' : '') +
                'min-view="' + (attrs.minView || 'date') + '"' + '></div>'
    },
    link: function($scope, iElement) {
      $scope.views = ['year', 'month', 'week', 'date']
      $scope.view = 'week'

      var calendar = iElement[0].querySelector('div[date-picker]')

      $scope.zoom = function(spaceToTheRight) {
        var cw = document.body.clientWidth
        var avail = cw - spaceToTheRight
        var zoom = avail / cw
        calendar.style.transform = 'scale(' + zoom + ')'
        calendar.setAttribute('class', (zoom < 1) ? 'zoom' : '')
      }
    },
    controller: ['$rootScope', '$scope', 'SidePanelState', 'SeriesListState', 'SeriesAddingState', function($rootScope, $scope, SidePanelState, SeriesListState, SeriesAddingState) {
      var calendar = this
      this.isShowing = false
      this.isExpanded = false

      $rootScope.isPanelOpen = function() {
        return !((!SeriesListState.state.isShowing && !SeriesAddingState.state.isShowing))
      }

      function zoom() {
        if (calendar.isExpanded) {
          $scope.zoom(840)
        } else if (calendar.isShowing) {
          $scope.zoom(450)
        } else {
          $scope.zoom(0)
        }
        $scope.$applyAsync()
      }

      /**
             * Hide the calendar (performance and weirds scrollbars) when the serieslist
             */
      $rootScope.$on('sidepanel:stateChange', function(event, state) {
        calendar.isShowing = state
        // console.debug("Sidepanel statechange from calendar:", event, state);
        zoom()
      })

      $rootScope.$on('sidepanel:sizeChange', function(event, expanded) {
        calendar.isExpanded = expanded
        // console.debug("Sidepanel sizechange from calendar:", event, expanded);
        zoom()
      })

      $rootScope.$on('serieslist:stateChange', function(event, state) {
        calendar.isShowing = !state
        // console.debug("Calendar statechange from fav panels:", event, state);
        zoom()
      })

      window.addEventListener('resize', zoom)
    }]
  }
})
;
/**
 * The <calendar-event> directive displays an episode on the calendar
 */
DuckieTV.directive('calendarEvent', ['SettingsService',
  function(SettingsService) {
    return {
      restrict: 'E',
      scope: {
        serie: '=',
        episode: '=',
        count: '='
      },
      transclude: true,
      templateUrl: 'templates/event.html',
      controller: ['$scope', '$location', function($scope, $location) {
        $scope.getSetting = SettingsService.get
        $scope.hoverTimer = null

        // Auto-switch background image to a relevant one for the calendar item when hovering over an item for 1.5s
        $scope.startHoverTimer = function() {
          $scope.clearHoverTimer()
          // Make sure serie has fanart defined
          if ($scope.serie.fanart) {
            var background = $scope.serie.fanart
            $scope.hoverTimer = setTimeout(function() {
              $scope.$root.$broadcast('background:load', background)
            }, 1500)
          }
        }

        $scope.clearHoverTimer = function() {
          clearTimeout($scope.hoverTimer)
        }

        $scope.selectEpisode = function(serie, episode) {
          $location.path('/serie/' + serie.TRAKT_ID + '/season/' + episode.seasonnumber + '?episode=' + episode.TRAKT_ID)
        }

        $scope.expand = function() {
          $scope.$emit('expand:serie', $scope.episode.firstaired, $scope.serie.ID_Serie)
        }
      }]
    }
  }
])

DuckieTV.directive('eventName', [function() {
  return {
    restrict: 'E',
    replace: true,
    templateUrl: 'templates/event/eventName.html'
  }
}])
;
/**
 * Click trap directive that catches clicks outside the sidepanel and hides it.
 */
DuckieTV.directive('clicktrap', ['SidePanelState', '$state',
  function(SidePanelState, $state) {
    return {
      restrict: 'E',
      link: function($scope, iElement) {
        iElement[0].onclick = function() {
          if (SidePanelState.state.isShowing) {
            Array.prototype.map.call(document.querySelectorAll('#actionbar a'), function(el) {
              el.classList.remove('active')
            })
            var elm = document.querySelector('#actionbar_calendar')
            elm.classList.add('fastspin')
            setTimeout(function() {
              $state.go('calendar').then(function() {
                setTimeout(function() {
                  elm.classList.remove('fastspin')
                }, 500)
              })
            })
          }
        }
      }
    }
  }
])
;
/**
 * Standalone Chrome Top Site list generator.
 * Provides the <chrome-top-sites> directive
 * That displays your most visited sites
 */
DuckieTV.provider('ChromeTopSites', function() {
  this.$get = ['$q',
    function($q) {
      return {
        /**
                 * Service wrapper round chrome's topSites API that provides a promise
                 * that's resolved when topistes are fetched.
                 * If current environment is not chrome then the promise is rejected.
                 */
        getTopSites: function() {
          var p = $q.defer()
          if (('chrome' in window && 'topSites' in window.chrome)) {
            chrome.topSites.get(function(result) {
              p.resolve(result)
            })
          } else {
            p.reject()
          }
          return p.promise
        }
      }
    }
  ]
})

/**
 * <chrome-top-sites> directive that shows the list of most visited
 * sites in chrome
 */
  .directive('chromeTopSites', ['ChromeTopSites',
    function(ChromeTopSites) {
      return {
        restrict: 'E',
        templateUrl: 'templates/chrome-top-sites.html',
        link: function($scope, iElement) {
          $scope.topSites = []
          ChromeTopSites.getTopSites().then(function(result) {
            $scope.topSites = result
          })

          // Toggles the TopSites Panel
          $scope.isShowing = false
          $scope.toggleTop = function() {
            if ($scope.isShowing) {
              $scope.isShowing = false
              iElement.removeClass('active')
            } else {
              $scope.isShowing = true
              iElement.addClass('active')
            }
          }
        }
      }
    }
  ])
;
DuckieTV

  .constant('datePickerConfig', {
    template: 'templates/datepicker.html',
    view: 'month',
    views: ['year', 'month', 'week', 'date', 'hours', 'minutes'],
    step: 5,
    startSunday: true
  })

  .directive('datePicker', ['datePickerConfig', '$injector', '$rootScope',
    function datePickerDirective(datePickerConfig, $injector, $rootScope) {
      // noinspection JSUnusedLocalSymbols
      return {
        template: '<div ng-include="template"></div>',
        scope: {
          model: '=datePicker',
          after: '=?',
          before: '=?'
        },
        link: function(scope, element, attrs) {
          function getVisibleMinutes(date, step) {
            date = new Date(date || new Date())
            date = new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours())
            var minutes = []
            var stop = date.getTime() + 60 * 60 * 1000
            while (date.getTime() < stop) {
              minutes.push(date)
              date = new Date(date.getTime() + step * 60 * 1000)
            }
            return minutes
          }

          function getVisibleWeek(date, startSunday) {
            date = new Date(date || new Date())
            date.setHours(0)
            date.setMinutes(0)
            date.setSeconds(0)
            date.setMilliseconds(0)

            var weeks = []
            var day = date.getDay()

            var startSunday = startSunday ? 0 : 1

            if (startSunday === 1 && date.getDay() === 0) {
              date.setDate(date.getDate() - 6)
            } else {
              date.setDate(date.getDate() - (date.getDay() - startSunday))
            }

            var week = []

            for (var i = 0; i < 7; i++) {
              week.push(new Date(date))
              date.setDate(date.getDate() + 1)
            }
            return [week]
          }

          function getVisibleWeeks(date, startSunday) {
            date = new Date(date || new Date())
            var startMonth = date.getMonth()

            var startYear = date.getYear()
            date.setDate(1)
            date.setHours(0)
            date.setMinutes(0)
            date.setSeconds(0)
            date.setMilliseconds(0)
            startSunday = startSunday ? 0 : 1

            if (date.getDay() === 0) {
              date.setDate(-6 + startSunday)
            } else {
              date.setDate(date.getDate() - (date.getDay() - startSunday))
            }

            var weeks = []
            while (weeks.length < 6) {
              if (date.getYear() == startYear && date.getMonth() > startMonth) break
              var week = []
              for (var i = 0; i < 7; i++) {
                week.push(new Date(date))
                date.setDate(date.getDate() + 1)
                date.setHours(date.getHours() > 12 ? date.getHours() + 2 : 0)
              }
              weeks.push(week)
            }
            return weeks
          }

          function getVisibleYears(date) {
            var years = []
            date = new Date(date || new Date())
            date.setFullYear(date.getFullYear() - (date.getFullYear() % 10))
            for (var i = 0; i < 12; i++) {
              years.push(new Date(date.getFullYear() + (i - 1), 0, 1))
            }
            return years
          }

          function getDaysOfWeek(date, startSunday) {
            date = new Date(date || new Date())
            date = new Date(date.getFullYear(), date.getMonth(), date.getDate())

            date.setDate(date.getDate() - (date.getDay() - (startSunday ? 0 : 1)))
            var days = []
            for (var i = 0; i < 7; i++) {
              days.push(new Date(date))
              date.setDate(date.getDate() + 1)
            }
            return days
          }

          function getVisibleMonths(date) {
            date = new Date(date || new Date())
            var year = date.getFullYear()
            var months = []
            for (var month = 0; month < 12; month++) {
              months.push(new Date(year, month, 1))
            }
            return months
          }

          function getVisibleHours(date) {
            date = new Date(date || new Date())
            date.setHours(0)
            date.setMinutes(0)
            date.setSeconds(0)
            date.setMilliseconds(0)
            var hours = []
            for (var i = 0; i < 24; i++) {
              hours.push(date)
              date = new Date(date.getTime() + 60 * 60 * 1000)
            }
            return hours
          }

          scope.date = new Date(scope.model || new Date())
          scope.views = datePickerConfig.views.concat()
          scope.view = attrs.view || datePickerConfig.view
          scope.now = new Date()
          scope.template = attrs.template || datePickerConfig.template

          var step = parseInt(attrs.step || datePickerConfig.step, 10)

          /** @namespace attrs.minView, attrs.maxView */
          scope.views = scope.views.slice(
            scope.views.indexOf(attrs.maxView || 'year'),
            scope.views.indexOf(attrs.minView || 'minutes') + 1
          )

          if (scope.views.length === 1 || scope.views.indexOf(scope.view) === -1) {
            scope.view = scope.views[0]
          }

          scope.eventService = attrs.eventService || false
          if (scope.eventService) {
            if ($injector.has(scope.eventService)) {
              scope.eventService = $injector.get(scope.eventService)
            }
          }

          $rootScope.$on('calendar:setdate', function(evt, newDate) {
            if (newDate !== undefined && scope.date.toDateString() != newDate.toDateString()) {
              scope.date = newDate
              update()
            }
          })

          scope.hasEvent = function(date) {
            return (scope.eventService) ? scope.eventService.hasEvent(date) : false
          }

          scope.getEvents = function(date) {
            return (scope.eventService) ? scope.eventService.getEvents(date) : false
          }

          scope.getTodoEvents = function() {
            return (scope.eventService) ? scope.eventService.getTodoEvents() : false
          }

          scope.getSeries = function(date) {
            return (scope.eventService) ? scope.eventService.getSeries(date) : false
          }

          scope.markDayWatched = function(day) {
            return (scope.eventService) ? scope.eventService.markDayWatched(day, scope.$root, $injector.get('SettingsService').get('episode.watched-downloaded.pairing')) : false
          }

          scope.markDayDownloaded = function(day) {
            return (scope.eventService) ? scope.eventService.markDayDownloaded(day, scope.$root) : false
          }

          var expandedSeries = {}

          scope.isExpanded = function(date, serie) {
            var key = [new Date(date).toDateString(), '_', serie].join('')
            return ((key in expandedSeries) && expandedSeries[key] === true)
          }

          scope.$on('expand:serie', function(event, date, serie) {
            var key = [new Date(date).toDateString(), '_', serie].join('')
            expandedSeries[key] = true
          })

          scope.setView = function(nextView) {
            if (scope.views.indexOf(nextView) !== -1) {
              scope.view = nextView
            }
          }

          scope.setDate = function(date) {
            scope.date = date
            // change next view
            var nextView = scope.views[scope.views.indexOf(scope.view) + 1]
            if (!nextView || scope.model) {
              scope.model = new Date(scope.model || date)

              // noinspection FallThroughInSwitchStatementJS
              switch (scope.view) {
                case 'minutes':
                  scope.model.setMinutes(date.getMinutes())
                  /* falls through */
                case 'hours':
                  scope.model.setHours(date.getHours())
                  /* falls through */
                case 'week':
                case 'date':
                  scope.model.setDate(date.getDate())
                  /* falls through */
                case 'month':
                  scope.model.setMonth(date.getMonth())
                  /* falls through */
                case 'year':
                  scope.model.setFullYear(date.getFullYear())
              }
              scope.$emit('setDate', scope.model, scope.view)
            } else if (nextView) {
              if (nextView == 'week' && scope.view == 'month') {
                nextView = 'date'
              }
              scope.setView(nextView)
            }
          }

          function update() {
            var view = scope.view
            var date = scope.date
            switch (view) {
              case 'year':
                scope.years = getVisibleYears(date)
                break
              case 'month':
                scope.months = getVisibleMonths(date)
                break
              case 'week':
                scope.weekdays = scope.weekdays || getDaysOfWeek(undefined, datePickerConfig.startSunday)
                scope.weeks = getVisibleWeek(date, datePickerConfig.startSunday)
                if (scope.eventService) {
                  scope.eventService.setVisibleDays(scope.weeks)
                }
                break
              case 'date':
                scope.weekdays = scope.weekdays || getDaysOfWeek(undefined, datePickerConfig.startSunday)
                scope.weeks = getVisibleWeeks(date, datePickerConfig.startSunday)
                if (scope.eventService) {
                  scope.eventService.setVisibleDays(scope.weeks)
                }
                break
              case 'hours':
                scope.hours = getVisibleHours(date)
                break
              case 'minutes':
                scope.minutes = getVisibleMinutes(date, step)
                break
            }
            scope.$emit('setDate', scope.date, scope.view)
          }

          function watch() {
            if (scope.view !== 'date') {
              return scope.view
            }
            return scope.model ? scope.model.getMonth() : null
          }

          scope.$watch(watch, update)

          scope.next = function(delta) {
            var date = scope.date
            delta = delta || 1
            switch (scope.view) {
              case 'year':
                /* falls through */
              case 'month':
                date.setFullYear(date.getFullYear() + delta)
                break
              case 'week':
                date.setDate(date.getDate() + (7 * delta))
                break
              case 'date':
                date.setMonth(date.getMonth() + delta)
                break
              case 'hours':
                /* falls through */
              case 'minutes':
                date.setHours(date.getHours() + delta)
                break
            }
            update()
          }

          scope.prev = function(delta) {
            return scope.next(-delta || -1)
          }

          scope.isAfter = function(date) {
            return scope.after ? scope.after.getTime() <= date.getTime() : false
          }

          scope.isBefore = function(date) {
            return scope.before ? scope.before.getTime() >= date.getTime() : false
          }

          scope.isSameMonth = function(date) {
            return scope.isSameYear(date) && scope.model.getMonth() === date.getMonth()
          }

          scope.isSameYear = function(date) {
            return (scope.model ? scope.model.getFullYear() === date.getFullYear() : false)
          }

          scope.isSameDay = function(date) {
            return scope.isSameMonth(date) && scope.model.getDate() === date.getDate()
          }

          scope.isSameHour = function(date) {
            return scope.isSameDay(date) && scope.model.getHours() === date.getHours()
          }

          scope.isSameMinutes = function(date) {
            return scope.isSameHour(date) && scope.model.getMinutes() === date.getMinutes()
          }

          scope.isNow = function(date) {
            var is = true
            var now = scope.now
            // noinspection FallThroughInSwitchStatementJS
            switch (scope.view) {
              case 'minutes':
                is &= ~~(date.getMinutes() / step) === ~~(now.getMinutes() / step)
                /* falls through */
              case 'hours':
                is &= date.getHours() === now.getHours()
                /* falls through */
              case 'date':
              case 'week':
                is &= date.getDate() === now.getDate()
                /* falls through */
              case 'month':
                is &= date.getMonth() === now.getMonth()
                /* falls through */
              case 'year':
                is &= date.getFullYear() === now.getFullYear()
            }
            return is
          }
        }
      }
    }
  ])
;
/**
 * The <episode-watched> directive shows the eye icon that marks an episode as watched.
 * Eye becomes green and not striked through when it's watched.
 */
DuckieTV.directive('episodeWatched', ['$filter', '$injector',
  function($filter, $injector) {
    var is_marked_lbl = $filter('translate')('EPISODEWATCHEDjs/is-marked/lbl')
    var not_marked_lbl = $filter('translate')('COMMON/not-marked/lbl')
    return {
      restrict: 'EA',
      transclude: true,
      replace: true,
      templateUrl: function($node, $iAttrs) {
        return $iAttrs.templateUrl || 'templates/episodeWatched.html'
      },
      link: function($scope) {
        /**
                 * Translates the watchedAt tooltip
                 */
        $scope.getWToolTip = function(episode) {
          return episode.isWatched() ? is_marked_lbl + $filter('date')(new Date(episode.watchedAt), 'medium') : not_marked_lbl
        }

        /**
                 * Pass the logic to the episode to handle marking watched in a generic way
                 */
        $scope.markWatched = function(episode) {
          if (episode.isWatched()) {
            episode.markNotWatched($injector.get('$rootScope'))
          } else {
            episode.markWatched($injector.get('SettingsService').get('episode.watched-downloaded.pairing'), $injector.get('$rootScope'))
          }
        }
      }
    }
  }
])
;
/**
 * The <episode-downloaded> directive shows the floppy-disk icon that marks an episode as downloaded.
 * Floppy-saved becomes green when it's downloaded.
 */
DuckieTV.directive('episodeDownloaded', ['$filter', '$injector',
  function($filter, $injector) {
    var is_downloaded_lbl = $filter('translate')('EPISODEDOWNLOADEDjs/is-downloaded/lbl')
    var not_downloaded_lbl = $filter('translate')('EPISODEDOWNLOADEDjs/not-downloaded/lbl')
    return {
      restrict: 'EA',
      transclude: true,
      replace: true,
      templateUrl: function($node, $iAttrs) {
        return $iAttrs.templateUrl || 'templates/episodeDownloaded.html'
      },
      link: function($scope) {
        /**
                 * Translates the downloaded tooltip
                 */
        $scope.getDToolTip = function(episode) {
          return episode.isDownloaded() ? is_downloaded_lbl : not_downloaded_lbl
        }

        /**
                 * Pass the logic to the episode to handle marking downloaded in a generic way
                 */
        $scope.markDownloaded = function(episode) {
          if (episode.isDownloaded()) {
            episode.markNotDownloaded($injector.get('SettingsService').get('episode.watched-downloaded.pairing'), $injector.get('$rootScope'))
          } else {
            episode.markDownloaded($injector.get('$rootScope'))
          }
        }
      }
    }
  }
])
;
DuckieTV.directive('fastSearch', ['$window', 'dialogs',
  function($window, dialogs) {
    var self = this

    this.fsquery = ''
    this.isNotKK = true // flag used to prevent kk sequence from triggering fast-search
    this.fsKKi = 0 // index used in preventing kk sequence from triggering fast-search

    // console.debug("fastsearch initializing");
    var isShowing = false

    var focusInput = function() {
      var i = document.querySelector('.fastsearch input')
      if (i) {
        i.value = self.fsquery
        i.focus()
        var e = document.createEvent('HTMLEvents')
        e.initEvent('onchange', true, true)
        i.dispatchEvent(e)
      } else {
        setTimeout(focusInput, 50)
      }
    }

    this.createDialog = function() {
      isShowing = true
      var d = dialogs.create('templates/dialogs/fastSearch.html', 'fastSearchCtrl', {
        key: self.fsquery
      }, {
        size: 'xs'
      })

      setTimeout(focusInput, 50)

      d.result.then(function() {
        // console.debug('Success');
        d = undefined
        isShowing = false
        self.fsquery = ''
      }, function() {
        // console.debug('Cancelled');
        d = undefined
        isShowing = false
        self.fsquery = ''
      })
    }

    return {
      restrict: 'E',
      link: function() {
        // console.debug("fastsearch initialized");
        $window.addEventListener('keydown', function(e) {
          // parse key codes, trap kk sequence
          var kk = [38, 38, 40, 40, 37, 39, 37, 39, 66, 65]
          if (e.keyCode === kk[self.fsKKi++]) {
            // possible kk sequence in progress
            if (self.fsKKi > 7) {
              // anticipating final kk sequence
              self.isNotKK = false
            }
          } else {
            // not kk sequence
            self.fsKKi = 0
            self.isNotKK = true
          }
        })
        $window.addEventListener('keypress', function(e) {
          // parse char codes for fs query
          if (!isShowing && e.target.tagName.toLowerCase() == 'input') {
            // keypress came from a non-fastSearch input element
            e.stopPropagation()
          } else if (self.isNotKK) {
            // keypress did not come from an input element
            self.fsquery += String.fromCharCode(e.charCode)
            if (!isShowing && e.target.tagName.toLowerCase() != 'input') {
              self.createDialog()
            }
          }
        })
      }
    }
  }
])

  .controller('fastSearchCtrl', ['$rootScope', '$scope', '$uibModalInstance', '$state', '$injector', 'data', 'FavoritesService', 'TraktTVv2', 'SeriesListState', 'SidePanelState', 'TorrentSearchEngines', 'SettingsService', 'NotificationService', 'DuckieTorrent',
    function($rootScope, $scope, $modalInstance, $state, $injector, data, FavoritesService, TraktTVv2, SeriesListState, SidePanelState, TorrentSearchEngines, SettingsService, NotificationService, DuckieTorrent) {
      $scope.searchprovider = SettingsService.get('torrenting.searchprovider')
      $scope.hasFocus = true
      $scope.model = {
        fsquery: data.key
      }

      $scope.searchResults = {
        series: [],
        traktSeries: [],
        episodes: [],
        torrents: []
      }

      $scope.seriesLoading = true
      $scope.traktSeriesLoading = true
      $scope.episodesLoading = true
      $scope.torrentsLoading = true

      $scope.fields = [{
        key: 'fsquery',
        type: 'input',
        modelOptions: {
          'debounce': {
            'default': 500,
            'blur': 0
          },
          updateOn: 'default blur'
        },
        templateOptions: {
          label: '',
          placeholder: '',
          type: 'text',
          onChange: function(e) {
            $scope.search(e)
          }
        },
        'expressionProperties': {
          'templateOptions.label': '"FASTSEARCHjs/search-anything/lbl"|translate',
          'templateOptions.placeholder': '"FASTSEARCHjs/placeholder"|translate'
        }
      }]

      $scope.getSerie = function(episode) {
        return FavoritesService.getByID_Serie(episode.ID_Serie)
      }

      $scope.search = function(value) {
        if (!value || value === '') {
          $scope.searchResults = {
            series: [],
            traktSeries: [],
            episodes: [],
            torrents: []
          }
          return
        }

        $scope.seriesLoading = true
        $scope.traktSeriesLoading = true
        $scope.episodesLoading = true
        $scope.torrentsLoading = true

        $scope.searchResults.series = FavoritesService.favorites.filter(function(serie) {
          $scope.seriesLoading = false
          var score = 0

          var query = value.toLowerCase().split(' ')

          var name = serie.name.toLowerCase()
          query.map(function(part) {
            if (name.indexOf(part) > -1) {
              score++
            }
          })
          return (score == query.length)
        })

        /**
             * Word-by-word scoring for search results for trakt.tv.
             * All words need to be in the search result's release name, or the result will be filtered out.
             */
        function traktFilterByScore(item) {
          var score = 0

          var query = value.toLowerCase().split(' ')

          var name = item.name.toLowerCase()
          query.map(function(part) {
            if (name.indexOf(part) > -1) {
              score++
            }
          })
          return (score == query.length)
        }
        /**
             * Word-by-word scoring for search results for torrents.
             * All words need to be in the search result's release name, or the result will be filtered out.
             */
        function torrentFilterByScore(item) {
          var score = 0

          var query = value.toLowerCase().split(' ')

          var name = item.releasename.toLowerCase()
          query.map(function(part) {
            if (name.indexOf(part) > -1) {
              score++
            }
          })
          return (score == query.length)
        }

        CRUD.Find('Episode', Array("episodename like '%" + value + "%'")).then(function(results) {
          $scope.searchResults.episodes = results
          $rootScope.$applyAsync()
          $scope.episodesLoading = false
        })

        TraktTVv2.search(value).then(function(results) {
          $scope.searchResults.traktSeries = results.filter(traktFilterByScore)
          $rootScope.$applyAsync()
          $scope.traktSeriesLoading = false
        }).catch(function(err) {
          console.error('TraktTV search error!', err)
          $scope.traktSeriesLoading = false
          $scope.searchResults.traktSeries = []
        })

        if (SettingsService.get('torrenting.enabled')) {
          TorrentSearchEngines.getSearchEngine($scope.searchprovider).search(value).then(function(results) {
            $scope.searchResults.torrents = results.filter(torrentFilterByScore)
            $rootScope.$applyAsync()
            $scope.torrentsLoading = false
          },
          function(err) {
            console.error('Torrent search error!', err)
            $scope.torrentsLoading = false
            $scope.searchResults.torrents = []
          })
        }
      }

      $scope.cancel = function() {
        $modalInstance.dismiss('Canceled')
      }

      /**
         * Add a show to favorites.*The serie object is a Trakt.TV TV Show Object.
         * Queues up the trakt_id in the serieslist.adding array so that the spinner can be shown.
         * Then adds it to the favorites list and when that 's done, toggles the adding flag to false so that
         * It can show the checkmark.
         */
      $scope.addTraktSerie = function(serie) {
        if (!FavoritesService.isAdding(serie.trakt_id)) {
          FavoritesService.adding(serie.trakt_id)
          return TraktTVv2.serie(serie.trakt_id).then(function(serie) {
            return FavoritesService.addFavorite(serie).then(function() {
              SidePanelState.hide()
              $rootScope.$broadcast('storage:update')
              FavoritesService.added(serie.trakt_id)
              $scope.search(self.fsquery)
            })
          }, function(err) {
            SidePanelState.hide()
            console.error('Error adding show!', err)
            FavoritesService.added(serie.trakt_id)
            FavoritesService.addError(serie.trakt_id, err)
          })
        }
      }

      /**
         * Verify with the favoritesservice if a specific trakt_id is registered.
         * Used to show checkmarks in the add modes for series that you already have.
         */
      $scope.isAdded = function(trakt_id) {
        return FavoritesService.isAdded(trakt_id)
      }

      /**
         * Returns true as long as the add a show to favorites promise is running.
         */
      $scope.isAdding = function(trakt_id) {
        return FavoritesService.isAdding(trakt_id)
      }

      /**
         * Returns true as long as the add a show to favorites promise is running.
         */
      $scope.isError = function(trakt_id) {
        return FavoritesService.isError(trakt_id)
      }

      // Selects and launches magnet
      var magnetSelect = function(magnet) {
        // console.debug("Magnet selected!", magnet);
        $modalInstance.close(magnet)

        TorrentSearchEngines.launchMagnet(magnet, data.key)
      }

      var urlSelect = function(url, releasename) {
        // console.debug("Torrent URL selected!", url);
        $modalInstance.close(url)

        window.parseTorrent.remote(url, function(err, torrentDecoded) {
          if (err) {
            throw err
          }
          var infoHash = torrentDecoded.infoHash.getInfoHash()
          $injector.get('$http').get(url, {
            responseType: 'blob'
          }).then(function(result) {
            try {
              TorrentSearchEngines.launchTorrentByUpload(result.data, infoHash, data.key, releasename)
            } catch (E) {
              TorrentSearchEngines.launchTorrentByURL(url, infoHash, data.key, releasename)
            }
          })
        })
      }

      $scope.select = function(result) {
        NotificationService.notify(result.releasename,
          'Download started on ' + DuckieTorrent.getClient().getName())
        if (result.magnetUrl) {
          // console.debug('using search magnet');
          return magnetSelect(result.magnetUrl)
        } else if (result.torrentUrl) {
          // console.debug('using search torrent');
          return urlSelect(result.torrentUrl, result.releasename)
        } else {
          TorrentSearchEngines.getSearchEngine($scope.searchprovider).getDetails(result.detailUrl, result.releasename).then(function(details) {
            if (details.magnetUrl) {
              // console.debug('using details magnet');
              result.magnetUrl = details.magnetUrl
              return magnetSelect(details.magnetUrl)
            } else if (details.torrentUrl) {
              // console.debug('using details torrent');
              return urlSelect(details.torrentUrl, result.releasename)
            }
          })
        }
      }

      function openUrl(id, url) {
        // revert back to using iframe, https://github.com/SchizoDuckie/DuckieTV/issues/1308
/*        if (SettingsService.isStandalone() && id === 'magnet') {
          // for standalone, open magnet url direct to os https://github.com/SchizoDuckie/DuckieTV/issues/834
          nw.Shell.openExternal(url)
          // console.debug("Open via OS", id, url);
        } else {*/
          // for chrome extension, open url on chromium via iframe
          var d = document.createElement('iframe')
          d.id = id + 'url_' + new Date().getTime()
          d.style.visibility = 'hidden'
          d.src = url
          document.body.appendChild(d)
          // console.debug("Open via Chromium", d.id, url);
          var dTimer = setInterval(function () {
            var dDoc = d.contentDocument || d.contentWindow.document
            if (dDoc.readyState == 'complete') {
              document.body.removeChild(d)
              clearInterval(dTimer)
              return
            }
          }, 1500)
//        }
      }

      $scope.submitMagnetLink = function(result) {
        if (result.magnetUrl) {
          // we have magnetUrl from search, use it
          openUrl('magnet', result.magnetUrl)
        } else {
          // we don't have magnetUrl from search, fetch from details instead
          TorrentSearchEngines.getSearchEngine($scope.searchprovider).getDetails(result.detailUrl, result.releasename).then(function(details) {
            if (details.magnetUrl) {
              result.magnetUrl = details.magnetUrl
              openUrl('magnet', details.magnetUrl)
            }
          })
        }
        return result
      }

      $scope.submitTorrentLink = function(result) {
        if (result.torrentUrl) {
          // we have torrentUrl from search, use it
          openUrl('torrent', result.torrentUrl)
        } else {
          // we don't have torrentUrl from search, fetch from details instead
          TorrentSearchEngines.getSearchEngine($scope.searchprovider).getDetails(result.detailUrl, result.releasename).then(function(details) {
            if (details.torrentUrl) {
              openUrl('torrent', details.torrentUrl)
            }
          })
        }
      }

      $scope.search(data.key)
    }
  ])
;
/**
 * The focus watch directive checks if the focusWatch property that's been set on the scope changes
 * and then executes a .focus() on the element.
 * Example: <input focus-watch='test'>
 * controller: $scope.test = true; // autofocus the element.
 */
DuckieTV.directive('focusWatch', function() {
  return {
    restrict: 'AC',
    scope: '=',
    link: function($scope, element) {
      if (element[0].getAttribute('focus-watch')) {
        if (navigator.userAgent.toLowerCase().match(/iPhone|iPad|Android/i)) {
          return
        }
        $scope.$watch(element[0].getAttribute('focus-watch'), function() {
          var el = element.length == 1 && element[0].tagName == 'INPUT' ? element[0] : element.find('input')[0]
          setTimeout(function() {
            this.focus()
          }.bind(el), 500)
        })
      }
    }
  }
})
;
/**
 * SchizoDuckie 2014
 * Lazy load background module.
 * Fades in the element that you set the lazy-background property to after the image has been loaded and
 * set as css background image.
 */
DuckieTV.directive('lazyBackground', ['$document',
  function($document) {
    return {
      restrict: 'A',
      scope: {
        altMode: '=altLazy'
      },
      link: function($scope, $element, $attrs) {
        var element, elementCont
        /**
         * altMode is a seperate loading mode where the lazyBackground directive isn't placed
         * on the element we're applying the background image. So we have two seperate variables
         * for the container and the image element. If we're not in altMode, the two variables
         * are the same so the code below will work regardless of modes.
         */
        if ($scope.altMode) {
          elementCont = $element
          element = $element.find('div')
        } else {
          elementCont = $element
          element = $element
        }

        /**
         * Observe the lazy-background attribute so that when it's set on a rendered element
         * it can fetch the new image and fade to it
         */
        $attrs.$observe('lazyBackground', function(newSrc) {
          // Make sure newSrc is valid else return error
          if (newSrc == null || newSrc == '') {
            element.css('background-image', '')
            elementCont.addClass('img-load-error')
            return
          }

          /**
           * Removes any error class on the element and then adds the loading class to the element.
           * This is required in cases where the element can load more than 1 image.
           */
          elementCont.removeClass('img-load-error')
          elementCont.addClass('img-loading')

          // hack to display the loading spinner on the poster
          // used for when the serieHeader is loading images from TMDB
          if (newSrc === '_loading') {
            return
          }

          /**
           * Use some oldskool preloading techniques to load the image
           */
          var img = $document[0].createElement('img')
          img.onload = function() {
            element.css('background-image', 'url("' + this.src + '")')
            elementCont.removeClass('img-loading')
            didLoad = true
          }

          img.onerror = function() {
            // Remove any existing background-image & loading class and apply error class
            element.css('background-image', '')
            elementCont.removeClass('img-loading')
            elementCont.addClass('img-load-error')
          }

          img.src = encodeURI(newSrc)
        })
      }
    }
  }
])
;
/**
 * The <mouse-wheel-down> directive lets you bind expressions to a mouse wheel scrolling down event.
 */
DuckieTV.directive('mouseWheelDown', function () {
  return function (scope, element, attrs) {
    element.bind('mousewheel', function (event) {
      var delta = Math.max(-1, Math.min(1, (event.wheelDelta || -event.detail)))
      if (delta < 0) {
        scope.$apply(function () {
          scope.$eval(attrs.mouseWheelDown)
        })
        event.preventDefault()
      }
    })
  }
})
;
/**
 * The <mouse-wheel-up> directive lets you bind expressions to a mouse wheel scrolling up event.
 */
DuckieTV.directive('mouseWheelUp', function () {
  return function (scope, element, attrs) {
    element.bind('mousewheel', function (event) {
      var delta = Math.max(-1, Math.min(1, (event.wheelDelta || -event.detail)))
      if (delta > 0) {
        scope.$apply(function () {
          scope.$eval(attrs.mouseWheelUp)
        })
        event.preventDefault()
      }
    })
  }
})
;
/**
 * Directive that only gets loaded when we're in nw.js (node-webkit) context.
 * This captures all target='_blank' links and opens them in the default external browser
 * so that we don't create new windows inside DuckieTV unintentionally.
 */

if ('nw' in window) {
  DuckieTV.directive('target', function() {
    return {
      restrict: 'A',
      scope: '=',
      link: function($scope, element) {
        if (element[0].getAttribute('target') && element[0].getAttribute('target').toLowerCase() == '_blank') {
          element[0].addEventListener('click', function(e) {
            e.stopPropagation()
            e.preventDefault()
            nw.Shell.openExternal(element[0].getAttribute('href'))
            return false
          })
        }
      }
    }
  })
}
;
DuckieTV.directive('loadingSpinner', function() {
  return {
    restrict: 'E',
    template: '<div class="loading-spinner"> <div></div> <div></div> </div>'
  }
})
;
/**
 * The serie-details directive is what handles the overview for a tv-show.
 * It shows show details, actors, if it's still airing, the individual seasons and the delete show button.
 */
DuckieTV.directive('serieDetails', ['FavoritesService', '$location', 'dialogs', '$filter', '$locale', 'SeriesMetaTranslations',
  function(FavoritesService, $location, dialogs, $filter, SeriesMetaTranslations) {
    return {
      restrict: 'E',
      transclude: true,
      replace: true,
      controllerAs: 'details',
      templateUrl: function(elem, attr) {
        return attr.templateUrl || 'templates/sidepanel/serie-details.html'
      },
      link: function($scope) {
        $scope.translateGenre = SeriesMetaTranslations.translateGenre
        $scope.translateStatus = SeriesMetaTranslations.translateStatus
        $scope.translateDayOfWeek = SeriesMetaTranslations.translateDayOfWeek

        /*
        * Takes a rating (8.12345) and coverts it percentage presentation (81)
        */
        $scope.ratingPercentage = function(rating) {
          return Math.round(rating * 10)
        }

        /**
         * Show the user a delete confirmation dialog before removing the show from favorites.
         * If confirmed: Remove from favorites and navigate back to the calendar.
         *
         * @param object serie Plain Old Javascript Object to delete
         */
        $scope.removeFromFavorites = function(serie) {
          var dlg = dialogs.confirm($filter('translate')('COMMON/serie-delete/hdr'),
            $filter('translate')('COMMON/serie-delete-question/desc') +
                        serie.name +
                        $filter('translate')('COMMON/serie-delete-question/desc2')
          )
          dlg.result.then(function(btn) {
            console.info("Removing serie '" + serie.name + "' from favorites!")
            FavoritesService.remove(serie)
            $location.path('/')
          }, function(btn) {
            $scope.confirmed = $filter('translate')('COMMON/cancelled/lbl')
          })
        }

        /**
         * Set the active season to one of the seaons passed to thedirective
         * @param object Season Plain Old Javascript Object season to fetch
         */
        $scope.setActiveSeason = function(season) {
          CRUD.FindOne('Season', {
            ID_Season: season.ID_Season
          }).then(function(season) {
            $scope.activeSeason = season
            $scope.$digest()
          })
        }

        /**
         * Format the airdate for a serie
         * @param object serie Plain Old Javascript Object
         * @return string formatted date
         */
        $scope.getAirDate = function(serie) {
          return new Date(serie.firstaired).toString()
        }

        /**
         * Hide or show a serie displaying on the calendar
         * @param object serie Plain Old Javascript Object
         */
        $scope.toggleSerieDisplay = function(serie) {
          CRUD.FindOne('Serie', {
            ID_Serie: serie.ID_Serie
          }).then(function(serie2) {
            if (serie2.get('displaycalendar') == 1) {
              $scope.serie.displaycalendar = 0
              serie2.set('displaycalendar', 0)
            } else {
              $scope.serie.displaycalendar = 1
              serie2.set('displaycalendar', 1)
            }
            // save updates to db
            $scope.$digest()
            serie2.Persist()
          })
        }
      }
    }
  }
])
;
/**
 * Generic serie header directive
 * Displays a poster of a banner from a tv show and provides navigation to it via the template
 */
DuckieTV.directive('serieheader', ['FanartService', function (FanartService) {
  return {
    restrict: 'E',
    transclude: true,
    scope: {
      'data': '=data',
      'noBadge': '=noBadge',
      'noListButton': '=noButton',
      'noOverview': '=noOverview',
      'noTitle': '=noTitle'
    },
    templateUrl: 'templates/serieHeader.html',
    link: function ($scope, element, attrs) {
      $scope.posterUrl = $scope.data.poster
      if (!$scope.data.poster) {
        $scope.posterUrl = '_loading'

        FanartService.getShowImages($scope.data).then(function (fanart) {
          $scope.posterUrl = fanart?.poster

          // mutate poster on serie, this is a hack to mutate the data for the trakt side panel when you click on a show
          $scope.data.poster = fanart?.poster
          $scope.$digest()
        })
      }
    }
  }
}])
;
DuckieTV.directive('seriesList', ['SeriesListState', 'SeriesAddingState', function(SeriesListState, SeriesAddingState) {
  return {
    restrict: 'E',
    controllerAs: 'serieslist',
    controller: function() {
      this.seriesListState = SeriesListState.state
      this.seriesAddingState = SeriesAddingState.state
    }
  }
}])
;
DuckieTV.directive('seriesGrid', function() {
  return {
    restrict: 'A',
    controllerAs: 'grid',
    controller: ['$scope', 'SettingsService', function($scope, SettingsService) {
      var posterWidth, posterHeight, postersPerRow, centeringOffset, oldClientWidth
      var container = document.querySelector('[series-grid]')
      var seriesGrid = container.querySelector('.series-grid')
      var noScroll = container.hasAttribute('no-scroll')

      // ease in out function thanks to:
      // http://blog.greweb.fr/2012/02/bezier-curve-based-easing-functions-from-concept-to-implementation/
      var easeInOutCubic = function(t) {
        return t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1
      }

      var position = function(start, end, elapsed, duration) {
        if (elapsed > duration) return end
        return start + (end - start) * easeInOutCubic(elapsed / duration) // <-- you can change the easing funtion there
      }

      var smoothScroll = function(el, duration) {
        if (!el || noScroll) {
          return
        }
        duration = duration || 350
        var start = container.scrollTop
        var end
        if (SettingsService.get('library.seriesgrid') == true) {
          end = parseInt(el.parentElement.style.transform.replace('translate3d(', '').split(',')[1].slice(1, -2)) - 150
        } else {
          end = el.offsetTop
        }
        var clock = Date.now()
        var step = function() {
          var elapsed = Date.now() - clock
          container.scrollTop = position(start, end, elapsed, duration)
          if (elapsed < duration) {
            window.requestAnimationFrame(step)
          }
        }
        step()
      }

      var activeScroller = null

      var scrollToActive = function() {
        clearTimeout(activeScroller)
        activeScroller = setTimeout(function() {
          smoothScroll(seriesGrid.querySelector('.serieheader.active'))
        }, 800)
      }

      function recalculate() {
        if (SettingsService.get('library.seriesgrid') == false) {
          return scrollToActive()
        }
        var isMini = container.classList.contains('miniposter')
        var maxPosters = container.getAttribute('max-posters') ? parseInt(container.getAttribute('max-posters')) : 0
        posterWidth = isMini ? 140 : 175 // Includes paddings
        posterHeight = isMini ? 197 : 247 // Includes paddings
        oldClientWidth = seriesGrid.clientWidth
        postersPerRow = Math.floor(seriesGrid.clientWidth / posterWidth)
        centeringOffset = (seriesGrid.clientWidth - (postersPerRow * posterWidth)) / 2

        if (maxPosters != 0) {
          seriesGrid.style.height = (Math.ceil(maxPosters / postersPerRow) * posterHeight) + 'px'
        }

        $scope.$applyAsync()
        scrollToActive()
      }

      var observer = new MutationObserver(function() {
        recalculate()
      })

      // configuration of the observer:
      var config = {
        attributes: true
      }

      observer.observe(container, config)
      observer.observe(document.querySelector('sidepanel'), config)

      this.getPosition = function(idx, max) {
        return 'transform: translate3d(' + getLeft(idx, max) + 'px, ' + getTop(idx) + 'px, 0px)'
      }

      var getLeft = function(idx, max) {
        if (idx === 0 && oldClientWidth != seriesGrid.clientWidth) {
          recalculate()
        }
        var rowCentering = 0
        var leftovers = max - (max % postersPerRow)
        if (max < postersPerRow || idx >= leftovers) { // if we're on the last line
          var postersInRow = max < postersPerRow ? max : max - leftovers
          rowCentering = (seriesGrid.clientWidth / 2) - ((postersInRow * posterWidth) / 2) - rowCentering
          var positionInRow = postersInRow - (max - idx)
          return rowCentering + (positionInRow * posterWidth)
        } else {
          return centeringOffset + rowCentering + ((idx % postersPerRow) * posterWidth)
        }
      }

      var getTop = function(idx) {
        if (idx === 0 && oldClientWidth != seriesGrid.clientWidth) {
          recalculate()
        }
        idx = idx + 1
        return (Math.ceil(idx / postersPerRow) * posterHeight) - posterHeight
      }
    }]
  }
})
;
DuckieTV
/**
 * A little directive to stop event propagation for elements with ng-click inside ng-click.
 * Add as attribute to the element you don't want to have it's click event bubbled.
 */
  .directive('stopEvent', function() {
    return {
      restrict: 'A',
      link: function(scope, element, attr) {
        element.bind('click', function(e) {
          e.stopPropagation()
        })
      }
    }
  })
;
DuckieTV.directive('sidepanel', function() {
  return {
    restrict: 'E',
    templateUrl: 'templates/sidepanel/sidepanel.html',
    controllerAs: 'panel',
    bindToController: true,
    transclude: true,

    controller: ['$rootScope', 'SidePanelState', function($rootScope, SidePanelState) {
      var panel = this

      this.isShowing = false
      this.isExpanded = false

      $rootScope.$on('sidepanel:stateChange', function(evt, showing) {
        panel.isShowing = showing
      })

      $rootScope.$on('sidepanel:sizeChange', function(evt, expanded) {
        panel.isExpanded = expanded
      })

      this.toggle = function() {
        this.isShowing ? SidePanelState.hide() : SidePanelState.show()
      }
      this.hide = function() {
        SidePanelState.hide()
      }
    }]
  }
})
;
DuckieTV.provider('SubtitleDialog', function() {
  this.$get = ['dialogs',
    function(dialogs) {
      // all web-enabled languages on

      return {
        search: function(str) {
          return dialogs.create('templates/dialogs/subtitle.html', 'subtitleDialogCtrl', {
            query: str
          }, {
            size: 'lg'
          })
        },
        searchFilename: function(filename) {
          return dialogs.create('templates/dialogs/subtitle.html', 'subtitleDialogCtrl', {
            filename: filename
          }, {
            size: 'lg'
          })
        },
        searchEpisode: function(serie, episode) {
          return dialogs.create('templates/dialogs/subtitle.html', 'subtitleDialogCtrl', {
            serie: serie,
            episode: episode
          }, {
            size: 'lg'
          })
        }
      }
    }
  ]
})

  .controller('subtitleDialogCtrl', ['$scope', '$rootScope', '$uibModalInstance', '$injector', 'data', 'OpenSubtitles', 'SettingsService', 'SceneNameResolver',
    function($scope, $rootScope, $modalInstance, $injector, data, OpenSubtitles, SettingsService, SceneNameResolver) {
      // -- Variables --//

      var customClients = {}
      var searchType = 2 // 0 = custom, 1 = episode, 2 = filename

      $scope.items = []
      $scope.searching = true

      $scope.episode = ('episode' in data) ? data.episode : null
      $scope.serie = ('serie' in data) ? data.serie : null
      $scope.query = ('query' in data) ? data.query : ''
      $scope.filename = ('filename' in data) ? data.filename : null

      if ($scope.filename !== null) {
        $scope.query = $scope.filename
        searchType = 2
      }

      if ($scope.episode && $scope.serie) {
        searchType = 1
        SceneNameResolver.getSearchStringForEpisode($scope.serie, $scope.episode).then(function(searchString) {
          $scope.query = searchString
        })
      }
      $scope.search = function(query) {
        $scope.searching = true
        $scope.items = []
        var promise = null
        if (query) {
          $scope.query = query
          searchType = 0
        }

        if (searchType == 1) {
          promise = OpenSubtitles.searchEpisode($scope.serie, $scope.episode)
        } else if (searchType == 2) {
          promise = OpenSubtitles.searchFilename($scope.filename)
        } else {
          promise = OpenSubtitles.searchString($scope.query)
        }

        promise.then(function(results) {
          $scope.items = results
          $scope.searching = false
          $scope.$applyAsync()
        },
        function(e) {
          $scope.searching = false
        })
      }

      $scope.setQuality = function(quality) {
        $scope.searchquality = quality
        $scope.search($scope.query)
      }

      $scope.cancel = function() {
        $modalInstance.dismiss('Canceled')
      }

      $scope.search()
    }
  ])

  .directive('subtitleDialog', ['SubtitleDialog', '$filter',
    function(SubtitleDialog, $filter) {
      return {
        restrict: 'E',
        transclude: true,
        wrap: true,
        replace: true,
        scope: {
          serie: '=serie',
          seasonNumber: '=seasonNumber',
          episodeNumber: '=episodeNumber',
          filename: '=filename'
        },
        template: '<a class="subtitle-dialog" ng-click="openDialog()" uib-tooltip="{{getTooltip()}}"><i class="glyphicon glyphicon-text-width"></i><span ng-transclude></span></a>',
        controller: ['$scope',
          function($scope) {
            // Translates the tooltip
            $scope.getTooltip = function() {
              return $scope.serie !== undefined
                ? $filter('translate')('SUBTITLEDIALOGjs/find-subtitle-for/tooltip') + $scope.serie.name
                : $filter('translate')('COMMON/find-subtitle/lbl')
            }
            $scope.openDialog = function() {
              if ($scope.serie && $scope.seasonNumber && $scope.episodeNumber) {
                SubtitleDialog.search($scope.serie, $scope.seasonNumber, $scope.episodeNumber)
              } else {
                if ($scope.filename) {
                  SubtitleDialog.search($scope.filename)
                } else {
                  SubtitleDialog.search('')
                }
              }
            }
          }
        ]
      }
    }
  ])
;
DuckieTV.directive('queryMonitor', ['$timeout', '$rootScope', function($timeout, $rootScope) {
  return {
    restrict: 'E',
    replace: true,
    templateUrl: 'templates/querymonitor.html',
    link: function($scope) {
      $scope.isRunning = false
      $scope.isFinished = false
      $scope.progress = 0
      $scope.data = {}

      $rootScope.$on('queryMonitor:update', function(event, data) {
        switch (data.type) {
          case 'start':
            $scope.progress = 0
            $scope.isRunning = true
            $scope.isFinished = false
            $scope.data = data.payload
            break
          case 'progress':
            $scope.data = data.payload
            $scope.progress = data.payload.current / data.payload.total * 100
            window.onbeforeunload = () => '' // need to return a string for it to work
            $scope.$digest()
            break
          case 'finish':
            $scope.data = data.payload
            $scope.progress = data.payload.current / data.payload.total * 100
            $scope.isFinished = true
            window.onbeforeunload = null
            $scope.$digest()

            // Small timeout before we hide it to show that it's done
            $timeout(function() {
              $scope.isRunning = false
            }, 1600)
            break
        }
      })
    }
  }
}])
;
DuckieTV
  .controller('torrentDialogCtrl', ['$scope', '$uibModalInstance', '$injector', 'data', 'TorrentSearchEngines', 'SettingsService', 'NotificationService', 'DuckieTorrent',
    function($scope, $modalInstance, $injector, data, TorrentSearchEngines, SettingsService, NotificationService, DuckieTorrent) {
      // -- Variables --//

      $scope.items = []
      $scope.searching = true
      $scope.error = false
      $scope.query = angular.copy(data.query)
      $scope.TRAKT_ID = angular.copy(data.TRAKT_ID)
      $scope.serie = angular.copy(data.serie)
      $scope.episode = angular.copy(data.episode)
      $scope.showAdvanced = SettingsService.get('torrentDialog.showAdvanced.enabled') // Show/Hide advanced torrent dialog filter options
      $scope.orderBy = 'seeders.d' // default sort column and sort direction (descending)
      $scope.searchprovider = SettingsService.get('torrenting.searchprovider')
      $scope.searchquality = SettingsService.get('torrenting.searchquality')
      $scope.minSeeders = SettingsService.get('torrenting.min_seeders')
      $scope.minSeedersEnabled = SettingsService.get('torrenting.min_seeders_enabled') // only applies to torrentDialog
      if ('serie' in data && $scope.serie.ignoreGlobalQuality != 0) {
        $scope.searchquality = '' // override quality when the series has the IgnoreQuality flag enabled.
      }
      $scope.requireKeywords = SettingsService.get('torrenting.require_keywords')
      $scope.requireKeywordsModeOR = SettingsService.get('torrenting.require_keywords_mode_or') // set the Require Keywords mode (Any or All)
      $scope.requireKeywordsEnabled = SettingsService.get('torrenting.require_keywords_enabled') // only applies to torrentDialog
      if ('serie' in data && $scope.serie.ignoreGlobalIncludes != 0) {
        $scope.requireKeywordsEnabled = false // override include-list when the series has the IgnoreIncludeList flag enabled.
      }
      $scope.ignoreKeywords = SettingsService.get('torrenting.ignore_keywords')
      $scope.ignoreKeywordsEnabled = SettingsService.get('torrenting.ignore_keywords_enabled') // only applies to torrentDialog
      if ('serie' in data && $scope.serie.ignoreGlobalExcludes != 0) {
        $scope.ignoreKeywordsEnabled = false // override exclude-list when the series has the IgnoreExcludeList flag enabled.
      }
      $scope.globalSizeMax = SettingsService.get('torrenting.global_size_max') // torrents larger than this are filtered out
      $scope.globalSizeMaxEnabled = SettingsService.get('torrenting.global_size_max_enabled') // only applies to torrentDialog
      $scope.globalSizeMin = SettingsService.get('torrenting.global_size_min') // torrents smaller than this are filtered out
      $scope.globalSizeMinEnabled = SettingsService.get('torrenting.global_size_min_enabled') // only applies to torrentDialog
      $scope.clients = Object.keys(TorrentSearchEngines.getSearchEngines())
      var provider = TorrentSearchEngines.getSearchEngine($scope.searchprovider)
      if ('serie' in data && $scope.serie.searchProvider != null) {
        provider = TorrentSearchEngines.getSearchEngine($scope.serie.searchProvider) // override searchProvider when the series has one defined.
        $scope.searchprovider = $scope.serie.searchProvider
      }
      $scope.jackettProviders = TorrentSearchEngines.getJackettEngines()
      $scope.supportsByDir = true // assume provider supports desc and asc sorting
      $scope.orderByDir = {
        'seeders': '.d',
        'leechers': '.a',
        'size': '.a',
        'age': '.d'
      } // the default sort direction for each possible sortBy (NOTE: seeders is flipped)
      if ('config' in provider && 'orderby' in provider.config) {
        $scope.orderByList = Object.keys(provider.config.orderby) // this SE's sort options
        if (provider.config.orderby['seeders']['d'] === provider.config.orderby['seeders']['a']) {
          // provider does not support desc and asc sorting
          $scope.supportsByDir = false
          $scope.orderByDir = {
            'seeders': '.a',
            'leechers': '.a',
            'size': '.a',
            'age': '.d'
          } // the default sort direction for each possible sortBy
        }
      } else {
        $scope.orderByList = []
      }

      /**
         * is provider a Jackett SE?
         */
      $scope.isJackett = function(jse) {
        return (jse in $scope.jackettProviders && $scope.jackettProviders[jse].enabled)
      }

      $scope.canOrderBy = function(order) {
        return ($scope.orderByList.indexOf(order) > -1)
      }

      $scope.isOrderBy = function(order) {
        return ($scope.orderBy.indexOf(order) > -1)
      }

      $scope.getName = function(provider) {
        return provider
      }

      var usingLabel = SettingsService.get('torrenting.label')

      $scope.search = function(q, TRAKT_ID, orderBy) {
        $scope.searching = true
        $scope.error = false
        $scope.query = q
        if (TRAKT_ID !== undefined) {
          $scope.TRAKT_ID = TRAKT_ID
        }
        if (typeof orderBy !== 'undefined') {
          $scope.orderBy = orderBy
        }
        // If query is empty, prompt user to enter something
        if (q === null || q === '' || q === undefined) {
          $scope.searching = false
          $scope.error = 'null'
          $scope.items = null
          return
        }

        /**
             * Word-by-word scoring for search results.
             * All words need to be in the search result's release name, or the result will be filtered out.
             */
        function filterByScore(item) {
          var score = 0
          var RequireKeywords_String = $scope.requireKeywordsEnabled ? $scope.requireKeywordsModeOR ? '' : $scope.requireKeywords : '' // if Require Keywords mode is AND then add require keywords to q
          // ignore double-quotes and plus symbols on query, and any query minus words
          var query = [q, $scope.searchquality, RequireKeywords_String].join(' ').toLowerCase().replace(/[\"\+]/g, ' ').trim().split(' ')
          var name = item.releasename.toLowerCase()
          query.map(function(part) {
            if (part[0] === '-' || name.indexOf(part) > -1) {
              score++
            }
          })
          return (score == query.length)
        }

        /**
             * Any words in the Require Keywords list causes the result to be filtered in.
             */
        function filterRequireKeywords(item) {
          if (!$scope.requireKeywordsEnabled || $scope.requireKeywords == '') {
            return true
          }
          var score = 0
          var query = $scope.requireKeywords.toLowerCase().split(' ')
          var name = item.releasename.toLowerCase()
          query.map(function(part) {
            if (name.indexOf(part) > -1) {
              score++
            }
          })
          return (score > 0)
        }

        /**
             * Any words in the ignore keyword list causes the result to be filtered out.
             */
        function filterIgnoreKeywords(item) {
          if (!$scope.ignoreKeywordsEnabled || $scope.ignoreKeywords == '') {
            return true
          }
          var score = 0
          var query = $scope.ignoreKeywords.toLowerCase().split(' ')
          // prevent the exclude list from overriding the primary search string
          query = query.filter(function(el) {
            return q.indexOf(el) == -1
          })
          var name = item.releasename.toLowerCase()
          query.map(function(part) {
            if (name.indexOf(part) > -1) {
              score++
            }
          })
          return (score == 0)
        }

        /**
             * Torrent sizes outside min-max range causes the result to be filtered out.
             */
        function filterBySize(item) {
          if (item.size == null || item.size == 'n/a') {
            // if item size not available then accept item
            return true
          }
          var size = item.size.split(/\s{1}/)[0] // size split into value and unit
          var sizeMin = null
          var sizeMax = null
          if ('serie' in data) {
            // if called from TorrentSearchEngines.findEpisode then serie custom search size is available for override
            sizeMin = ($scope.serie.customSearchSizeMin !== null) ? $scope.serie.customSearchSizeMin : $scope.globalSizeMin
            sizeMax = ($scope.serie.customSearchSizeMax !== null) ? $scope.serie.customSearchSizeMax : $scope.globalSizeMax
          } else {
            sizeMin = $scope.globalSizeMin
            sizeMax = $scope.globalSizeMax
          }
          // set up accepted size range
          sizeMin = (sizeMin == null) ? 0 : sizeMin
          sizeMax = (sizeMax == null) ? Number.MAX_SAFE_INTEGER : sizeMax
          // ignore global and custom search size min ?
          sizeMin = ($scope.globalSizeMinEnabled) ? sizeMin : 0
          // ignore global and custom search size max ?
          sizeMax = ($scope.globalSizeMaxEnabled) ? sizeMax : Number.MAX_SAFE_INTEGER
          return (size >= sizeMin && size <= sizeMax)
        }

        /**
             * drop duplicates from results by matching detailUrl (or releasename if former is not available)
             */
        function dropDuplicates(items) {
          var arr = {}
          for (var i = 0, len = items.length; i < len; i++) {
            if (!items[i].detailUrl) {
              arr[items[i]['releasename']] = items[i]
            } else {
              arr[items[i]['detailUrl']] = items[i]
            }
          }
          items = new Array()
          for (var key in arr) {
            items.push(arr[key])
          }
          return items
        }

        /**
             * filter by minimum seeders.
             */
        function filterByMinSeeders(item) {
          if (!$scope.minSeedersEnabled) {
            return true
          }
          return (item.seeders === 'n/a' || parseInt(item.seeders, 10) >= $scope.minSeeders)
        }

        /**
             * Search torrent SE  for the torrent query
             */
        TorrentSearchEngines.getSearchEngine($scope.searchprovider).search([q, $scope.searchquality].join(' ').trim(), undefined, $scope.orderBy).then(function(results) {
          if (localStorage.getItem('debugSE')) {
            if ('serie' in data) {
              console.debug('TD manual search with preloaded series')
            } else {
              console.debug('TD manual search free-form')
            }
            console.debug('sp=[%s]', $scope.searchprovider)
            console.debug('Q=[%s]', q)
            if ('serie' in data) {
              console.debug('cIGQ=[%s]', $scope.serie.ignoreGlobalQuality)
            }
            console.debug('q=[%s]', $scope.searchquality)
            if ('serie' in data) {
              console.debug('cIRK=[%s]', $scope.serie.ignoreGlobalIncludes)
            }
            console.debug('RKe=[%s], RKm=[%s], RK=[%s]', $scope.requireKeywordsEnabled, $scope.requireKeywordsModeOR, $scope.requireKeywords)
            if ('serie' in data) {
              console.debug('cIIK=[%s]', $scope.serie.ignoreGlobalExcludes)
            }
            console.debug('IKe=[%s], IK=[%s]', $scope.ignoreKeywordsEnabled, $scope.ignoreKeywords)
            if ('serie' in data) {
              console.debug('cSmin=[%s], cSmax=[%s]', $scope.serie.customSearchSizeMin, $scope.serie.customSearchSizeMax)
            }
            console.debug('SminE=[%s], Smin=[%s], SmaxE=[%s], Smax=[%s]', $scope.globalSizeMinEnabled, $scope.globalSizeMin, $scope.globalSizeMaxEnabled, $scope.globalSizeMax)
            console.debug('Se=[%s], S=[%s]', $scope.minSeedersEnabled, $scope.minSeeders)
            results.map(function(item) {
              console.debug('releasename=[%s], size=[%s], seeders=[%s]', item.releasename, item.size, item.seeders)
            })
          }
          $scope.items = results.filter(filterByScore)
          if (localStorage.getItem('debugSE')) {
            $scope.items.map(function(item) {
              console.debug('afterFilterByScore: releasename=[%s], size=[%s], seeders=[%s]', item.releasename, item.size, item.seeders)
            })
          }
          $scope.items = $scope.items.filter(filterByMinSeeders)
          if (localStorage.getItem('debugSE')) {
            $scope.items.map(function(item) {
              console.debug('afterFilterByMinSeeders: releasename=[%s], size=[%s], seeders=[%s]', item.releasename, item.size, item.seeders)
            })
          }
          if ($scope.requireKeywordsModeOR) {
            $scope.items = $scope.items.filter(filterRequireKeywords)
            if (localStorage.getItem('debugSE')) {
              $scope.items.map(function(item) {
                console.debug('afterFilterRequireKeywords: releasename=[%s], size=[%s], seeders=[%s]', item.releasename, item.size, item.seeders)
              })
            }
          }
          $scope.items = $scope.items.filter(filterIgnoreKeywords)
          if (localStorage.getItem('debugSE')) {
            $scope.items.map(function(item) {
              console.debug('AfterFilterIgnoreKeywords: releasename=[%s], size=[%s], seeders=[%s]', item.releasename, item.size, item.seeders)
            })
          }
          $scope.items = $scope.items.filter(filterBySize)
          if (localStorage.getItem('debugSE')) {
            $scope.items.map(function(item) {
              console.debug('afterFilterBySize: releasename=[%s], size=[%s], seeders=[%s]', item.releasename, item.size, item.seeders)
            })
          }
          // ShowRSS uses the same detailUrl for all of a series' episodes, so don't call dropDuplicates
          if ($scope.searchprovider !== 'ShowRSS') {
            $scope.items = dropDuplicates($scope.items)
            if (localStorage.getItem('debugSE')) {
              $scope.items.map(function(item) {
                console.debug('afterFilterDuplicates: releasename=[%s], size=[%s], seeders=[%s]', item.releasename, item.size, item.seeders)
              })
            }
          }
          $scope.searching = false
        },
        function(e) {
          $scope.searching = false
          if (e !== null && typeof e === 'object' && 'status' in e && 'statusText' in e) {
            $scope.error = 'status ' + e.status + ' ' + e.statusText
          } else {
            $scope.error = e.toString()
          }
          $scope.items = null
        })
      }

      // Save state of torrenting minSeeders check-box
      $scope.setMinSeedersState = function() {
        SettingsService.set('torrenting.min_seeders_enabled', $scope.minSeedersEnabled)
        $scope.search($scope.query, undefined, $scope.orderBy)
      }

      // Save state of torrenting Require Keywords check-box
      $scope.setRequireKeywordsState = function() {
        SettingsService.set('torrenting.require_keywords_enabled', $scope.requireKeywordsEnabled)
        $scope.search($scope.query, undefined, $scope.orderBy)
      }

      // Save state of torrenting ignore keyword check-box
      $scope.setIgnoreKeywordsState = function() {
        SettingsService.set('torrenting.ignore_keywords_enabled', $scope.ignoreKeywordsEnabled)
        $scope.search($scope.query, undefined, $scope.orderBy)
      }

      // Save state of torrenting global size min check-box
      $scope.setGlobalSizeMinState = function() {
        SettingsService.set('torrenting.global_size_min_enabled', $scope.globalSizeMinEnabled)
        $scope.search($scope.query, undefined, $scope.orderBy)
      }

      // Save state of torrenting global size max check-box
      $scope.setGlobalSizeMaxState = function() {
        SettingsService.set('torrenting.global_size_max_enabled', $scope.globalSizeMaxEnabled)
        $scope.search($scope.query, undefined, $scope.orderBy)
      }

      // Changes the search quality while searching for a torrent
      $scope.setQuality = function(quality) {
        $scope.searchquality = quality
        $scope.search($scope.query, undefined, $scope.orderBy)
      }

      // Changes what search provider you search with
      $scope.setProvider = function(newProvider) {
        TorrentSearchEngines.getSearchEngine($scope.searchprovider).cancelActiveRequest()
        $scope.searchprovider = newProvider
        provider = TorrentSearchEngines.getSearchEngine($scope.searchprovider)
        $scope.supportsByDir = true // assume provider supports desc and asc sorting
        $scope.orderByDir = {
          'seeders': '.d',
          'leechers': '.a',
          'size': '.a',
          'age': '.d'
        } // the default sort direction for each possible sortBy (NOTE: flipped)
        if ('config' in provider && 'orderby' in provider.config) {
          // load this provider's orderBy list
          $scope.orderByList = Object.keys(provider.config.orderby) // this SE's sort options
          if (provider.config.orderby['seeders']['d'] === provider.config.orderby['seeders']['a']) {
            // provider does not support desc and asc sorting
            $scope.supportsByDir = false
            $scope.orderByDir = {
              'seeders': '.a',
              'leechers': '.a',
              'size': '.a',
              'age': '.d'
            } // the default sort direction for each possible sortBy
          }
        } else {
          // this provider does not support orderBy sorting
          $scope.orderByList = []
        }
        // reset orderBy since the new provider may not have the currently active orderBy param
        $scope.orderBy = 'seeders.d'
        $scope.search($scope.query, undefined, $scope.orderBy)
      }

      // Changes the sort order of the search results
      $scope.setOrderBy = function(orderby) {
        if ($scope.supportsByDir) {
          // provider supports desc and asc sorting, so flip the direction
          $scope.orderByDir[orderby] === '.a' ? $scope.orderByDir[orderby] = '.d' : $scope.orderByDir[orderby] = '.a' // flip sort direction
        }
        $scope.orderBy = orderby + $scope.orderByDir[orderby]
        $scope.search($scope.query, undefined, $scope.orderBy)
      }

      $scope.cancel = function() {
        $modalInstance.dismiss('Canceled')
      }

      // Toggle advanced filter state
      $scope.toggleShowAdvanced = function() {
        $scope.showAdvanced = !$scope.showAdvanced
        SettingsService.set('torrentDialog.showAdvanced.enabled', $scope.showAdvanced)
      }

      // Selects and launches magnet
      var magnetSelect = function(magnet, dlPath, label) {
        // console.debug("Magnet selected!", magnet, dlPath, label);
        if (typeof $scope.episode !== 'undefined') { // don't close dialogue if search is free-form
          $modalInstance.close(magnet)
        }

        var channel = $scope.TRAKT_ID !== null ? $scope.TRAKT_ID : $scope.query
        TorrentSearchEngines.launchMagnet(magnet, channel, dlPath, label)
      }

      var urlSelect = function(url, releasename, dlPath, label) {
        // console.debug("Torrent URL selected!", url, dlPath, label);
        if (typeof $scope.episode !== 'undefined') { // don't close dialogue if search is free-form
          $modalInstance.close(url)
        }

        var channel = $scope.TRAKT_ID !== null ? $scope.TRAKT_ID : $scope.query
        window.parseTorrent.remote(url, function(err, torrentDecoded) {
          if (err) {
            throw err
          }
          var infoHash = torrentDecoded.infoHash.getInfoHash()
          $injector.get('$http').get(url, {
            responseType: 'blob'
          }).then(function(result) {
            try {
              TorrentSearchEngines.launchTorrentByUpload(result.data, infoHash, channel, releasename, dlPath, label)
            } catch (E) {
              TorrentSearchEngines.launchTorrentByURL(url, infoHash, channel, releasename, dlPath, label)
            }
          })
        })
      }

      var debugNotify = function(notificationId) { if (window.debug982) console.debug('TD notify id', notificationId) }
      $scope.select = function(result) {
        // console.debug('select', result);
        var dlPath = ($scope.serie) ? $scope.serie.dlPath : null
        var label = ($scope.serie && usingLabel) ? $scope.serie.name : null
        NotificationService.notify(result.releasename,
          'Download started on ' + DuckieTorrent.getClient().getName(),
          debugNotify
        )
        if (result.magnetUrl) {
          // console.debug('using search magnet');
          return magnetSelect(result.magnetUrl, dlPath, label)
        } else if (result.torrentUrl) {
          // console.debug('using search torrent');
          return urlSelect(result.torrentUrl, result.releasename, dlPath, label)
        } else {
          TorrentSearchEngines.getSearchEngine($scope.searchprovider).getDetails(result.detailUrl, result.releasename).then(function(details) {
            if (details.magnetUrl) {
              // console.debug('using details magnet');
              result.magnetUrl = details.magnetUrl
              return magnetSelect(details.magnetUrl, dlPath, label)
            } else if (details.torrentUrl) {
              // console.debug('using details torrent');
              return urlSelect(details.torrentUrl, result.releasename, dlPath, label)
            }
          })
        }
      }

      function openUrl(id, url) {
        // revert back to using iframe, https://github.com/SchizoDuckie/DuckieTV/issues/1308
/*        if (SettingsService.isStandalone() && id === 'magnet') {
          // for standalone, open magnet url direct to os https://github.com/SchizoDuckie/DuckieTV/issues/834
          nw.Shell.openExternal(url)
          // console.debug("Open via OS", id, url);
        } else {*/
          // for chrome extension, open url on chromium via iframe
          var d = document.createElement('iframe')
          d.id = id + 'url_' + new Date().getTime()
          d.style.visibility = 'hidden'
          d.src = url
          document.body.appendChild(d)
          // console.debug("Open via Chromium", d.id, url);
          var dTimer = setInterval(function() {
            var dDoc = d.contentDocument || d.contentWindow.document
            if (dDoc.readyState == 'complete') {
              document.body.removeChild(d)
              clearInterval(dTimer)
              return
            }
          }, 1500)
//        }
      }

      $scope.submitMagnetLink = function(result) {
        if (result.magnetUrl) {
          // we have magnetUrl from search, use it
          openUrl('magnet', result.magnetUrl)
        } else {
          // we don't have magnetUrl from search, fetch from details instead
          TorrentSearchEngines.getSearchEngine($scope.searchprovider).getDetails(result.detailUrl, result.releasename).then(function(details) {
            if (details.magnetUrl) {
              result.magnetUrl = details.magnetUrl
              openUrl('magnet', details.magnetUrl)
            }
          })
        }
        return result
      }

      $scope.submitTorrentLink = function(result) {
        if (result.torrentUrl) {
          // we have torrentUrl from search, use it
          openUrl('torrent', result.torrentUrl)
        } else {
          // we don't have torrentUrl from search, fetch from details instead
          TorrentSearchEngines.getSearchEngine($scope.searchprovider).getDetails(result.detailUrl, result.releasename).then(function(details) {
            if (details.torrentUrl) {
              openUrl('torrent', details.torrentUrl)
            }
          })
        }
      }

      $scope.search($scope.query, undefined, $scope.orderBy)
    }
  ])

  .directive('torrentDialog', ['TorrentSearchEngines', '$filter', 'SettingsService',
    function(TorrentSearchEngines, $filter, SettingsService) {
      if (!SettingsService.get('torrenting.enabled')) {
        // if torrenting features are disabled hide
        return {
          template: '<a></a>'
        }
      } else {
        return {
          restrict: 'E',
          transclude: true,
          wrap: true,
          replace: true,
          scope: {
            q: '=q',
            TRAKT_ID: '=traktid',
            serie: '=serie',
            episode: '=episode'
          },
          template: '<a class="torrent-dialog" ng-click="openDialog()" uib-tooltip="{{getTooltip()}}"><i class="glyphicon glyphicon-download"></i><span ng-transclude></span></a>',
          controller: ['$scope',
            function($scope) {
              // Translates the tooltip
              $scope.getTooltip = function() {
                if ($scope.q) {
                  return $filter('translate')('TORRENTDIALOG/search-download-this/tooltip') + $scope.q
                } else if ($scope.episode && $scope.serie) {
                  return $filter('translate')('TORRENTDIALOG/search-download-this/tooltip') + $scope.serie.name + ' ' + $scope.episode.getFormattedEpisode()
                } else {
                  return $filter('translate')('TORRENTDIALOG/search-download-any/tooltip')
                }
              }
              // Opens the torrent search with the episode selected
              $scope.openDialog = function() {
                if ($scope.serie && $scope.episode) {
                  TorrentSearchEngines.findEpisode($scope.serie, $scope.episode)
                } else {
                  TorrentSearchEngines.search($scope.q, $scope.TRAKT_ID)
                }
              }
            }
          ]
        }
      }
    }
  ])
;
DuckieTV

  .controller('torrentDialog2Ctrl', ['$scope', '$uibModalInstance', '$injector', 'data', 'TorrentSearchEngines', 'SettingsService', 'NotificationService', 'DuckieTorrent',
    function($scope, $modalInstance, $injector, data, TorrentSearchEngines, SettingsService, NotificationService, DuckieTorrent) {
      // -- Variables --//

      $scope.searching = true
      $scope.error = false
      $scope.query = angular.copy(data.query)
      $scope.TRAKT_ID = angular.copy(data.TRAKT_ID)
      $scope.serie = angular.copy(data.serie)
      $scope.episode = angular.copy(data.episode)
      $scope.showAdvanced = SettingsService.get('torrentDialog.showAdvanced.enabled') // Show/Hide advanced torrent dialog filter options
      $scope.searchquality = SettingsService.get('torrenting.searchquality')
      $scope.minSeeders = SettingsService.get('torrenting.min_seeders')
      $scope.minSeedersEnabled = SettingsService.get('torrenting.min_seeders_enabled') // only applies to torrentDialog
      if ('serie' in data && $scope.serie.ignoreGlobalQuality != 0) {
        $scope.searchquality = '' // override quality when the series has the IgnoreQuality flag enabled.
      }
      $scope.requireKeywords = SettingsService.get('torrenting.require_keywords')
      $scope.requireKeywordsModeOR = SettingsService.get('torrenting.require_keywords_mode_or') // set the Require Keywords mode (Any or All)
      $scope.requireKeywordsEnabled = SettingsService.get('torrenting.require_keywords_enabled') // only applies to torrentDialog
      if ('serie' in data && $scope.serie.ignoreGlobalIncludes != 0) {
        $scope.requireKeywordsEnabled = false // override include-list when the series has the IgnoreIncludeList flag enabled.
      }
      $scope.ignoreKeywords = SettingsService.get('torrenting.ignore_keywords')
      $scope.ignoreKeywordsEnabled = SettingsService.get('torrenting.ignore_keywords_enabled') // only applies to torrentDialog
      if ('serie' in data && $scope.serie.ignoreGlobalExcludes != 0) {
        $scope.ignoreKeywordsEnabled = false // override exclude-list when the series has the IgnoreExcludeList flag enabled.
      }
      $scope.globalSizeMax = SettingsService.get('torrenting.global_size_max') // torrents larger than this are filtered out
      $scope.globalSizeMaxEnabled = SettingsService.get('torrenting.global_size_max_enabled') // only applies to torrentDialog
      $scope.globalSizeMin = SettingsService.get('torrenting.global_size_min') // torrents smaller than this are filtered out
      $scope.globalSizeMinEnabled = SettingsService.get('torrenting.global_size_min_enabled') // only applies to torrentDialog
      $scope.sortByDir = {'sortname': '-', 'engine': '+', 'seedersInt': '+', 'leechersInt': '+', 'sizeInt': '+'} // the default sort direction for each possible sortBy
      $scope.sortBy = SettingsService.get('torrentDialog.2.sortBy') // '+engine' the default order
      $scope.sortByDir[$scope.sortBy.replace(/\-|\+/g, '')] = $scope.sortBy.substring(0, 1)
      $scope.items = []
      $scope.defaultProvider = SettingsService.get('torrenting.searchprovider')
      $scope.clients = Object.keys(TorrentSearchEngines.getSearchEngines())
      $scope.activeSE = SettingsService.get('torrentDialog.2.activeSE') // get active search engines previously saved
      $scope.activeSE[$scope.defaultProvider] = true
      $scope.clients.forEach(function(name) {
        // add any new search engines discovered, default them as active.
        if (!(name in $scope.activeSE)) {
          $scope.activeSE[name] = true
        }
      })
      $scope.jackettProviders = TorrentSearchEngines.getJackettEngines()
      SettingsService.set('torrentDialog.2.activeSE', $scope.activeSE) // save updated active SE list.
      /**
         * is provider a Jackett SE?
         */
      $scope.isJackett = function(jse) {
        return (jse in $scope.jackettProviders && $scope.jackettProviders[jse].enabled)
      }

      // Changes the sort order of the search results
      $scope.setSortBy = function(sortby) {
        $scope.sortByDir[sortby] === '-' ? $scope.sortByDir[sortby] = '+' : $scope.sortByDir[sortby] = '-' // flip sort direction
        $scope.sortBy = $scope.sortByDir[sortby] + sortby
        SettingsService.set('torrentDialog.2.sortBy', $scope.sortBy)
      }

      var usingLabel = SettingsService.get('torrenting.label')

      $scope.search = function(q, TRAKT_ID) {
        $scope.searching = true
        $scope.error = false
        $scope.query = q
        if (TRAKT_ID !== undefined) {
          $scope.TRAKT_ID = TRAKT_ID
        }
        // If query is empty, prompt user to enter something
        if (q === null || q === '' || q === undefined) {
          $scope.searching = false
          $scope.error = 'null'
          $scope.items = null
          return
        }

        /**
             * Word-by-word scoring for search results.
             * All words need to be in the search result's release name, or the result will be filtered out.
             */
        function filterByScore(item) {
          var score = 0
          var RequireKeywords_String = $scope.requireKeywordsEnabled ? $scope.requireKeywordsModeOR ? '' : $scope.requireKeywords : '' // if Require Keywords mode is AND then add require keywords to q
          // ignore double-quotes and plus symbols on query, and any query minus words
          var query = [q, $scope.searchquality, RequireKeywords_String].join(' ').toLowerCase().replace(/[\"\+]/g, ' ').trim().split(' ')
          var name = item.releasename.toLowerCase()
          query.map(function(part) {
            if (part[0] === '-' || name.indexOf(part) > -1) {
              score++
            }
          })
          return (score == query.length)
        }

        /**
             * Any words in the Require Keywords list causes the result to be filtered in.
             */
        function filterRequireKeywords(item) {
          if (!$scope.requireKeywordsEnabled || $scope.requireKeywords == '') {
            return true
          }
          var score = 0
          var query = $scope.requireKeywords.toLowerCase().split(' ')
          var name = item.releasename.toLowerCase()
          query.map(function(part) {
            if (name.indexOf(part) > -1) {
              score++
            }
          })
          return (score > 0)
        }

        /**
             * Any words in the ignore keyword list causes the result to be filtered out.
             */
        function filterIgnoreKeywords(item) {
          if (!$scope.ignoreKeywordsEnabled || $scope.ignoreKeywords == '') {
            return true
          }
          var score = 0
          var query = $scope.ignoreKeywords.toLowerCase().split(' ')
          // prevent the exclude list from overriding the primary search string
          query = query.filter(function(el) {
            return q.indexOf(el) == -1
          })
          var name = item.releasename.toLowerCase()
          query.map(function(part) {
            if (name.indexOf(part) > -1) {
              score++
            }
          })
          return (score == 0)
        }

        /**
             * Torrent sizes outside min-max range causes the result to be filtered out.
             */
        function filterBySize(item) {
          if (item.size == null || item.size == 'n/a') {
            // if item size not available then accept item
            return true
          }
          var size = item.size.split(/\s{1}/)[0] // size split into value and unit
          var sizeMin = null
          var sizeMax = null
          if ('serie' in data) {
            // if called from TorrentSearchEngines.findEpisode then serie custom search size is available for override
            sizeMin = ($scope.serie.customSearchSizeMin !== null) ? $scope.serie.customSearchSizeMin : $scope.globalSizeMin
            sizeMax = ($scope.serie.customSearchSizeMax !== null) ? $scope.serie.customSearchSizeMax : $scope.globalSizeMax
          } else {
            sizeMin = $scope.globalSizeMin
            sizeMax = $scope.globalSizeMax
          }
          // set up accepted size range
          sizeMin = (sizeMin == null) ? 0 : sizeMin
          sizeMax = (sizeMax == null) ? Number.MAX_SAFE_INTEGER : sizeMax
          // ignore global and custom search size min ?
          sizeMin = ($scope.globalSizeMinEnabled) ? sizeMin : 0
          // ignore global and custom search size max ?
          sizeMax = ($scope.globalSizeMaxEnabled) ? sizeMax : Number.MAX_SAFE_INTEGER
          return (size >= sizeMin && size <= sizeMax)
        }

        /**
             * drop duplicates from results by matching detailUrl (or releasename if former is not available)
             */
        function dropDuplicates(items) {
          var arr = {}
          for (var i = 0, len = items.length; i < len; i++) {
            if (!items[i].detailUrl) {
              arr[items[i]['releasename']] = items[i]
            } else {
              arr[items[i]['detailUrl']] = items[i]
            }
          }
          items = new Array()
          for (var key in arr) {
            items.push(arr[key])
          }
          return items
        }

        /**
             * filter by minimum seeders.
             */
        function filterByMinSeeders(item) {
          if (!$scope.minSeedersEnabled) {
            return true
          }
          return (item.seeders === 'n/a' || parseInt(item.seeders, 10) >= $scope.minSeeders)
        }

        /**
             * Search with each torrent SE for the torrent query
             */
        $scope.items = []
        $scope.error = false
        $scope.errorEngine = null
        $scope.clients.forEach(function(engine) {
          if ($scope.activeSE[engine]) {
            items = []
            $scope.searching = true
            provider = TorrentSearchEngines.getSearchEngine(engine)
            provider.search([q, $scope.searchquality].join(' ').trim(), undefined, 'seeders.d').then(function(results) {
              results.forEach(function(item) {
                item.engine = engine // used by torrentDialog2.html
                item.sizeInt = isNaN(item.size.replace(' MB', '')) ? 0 : parseInt(item.size) // used for torrentDialog2 sorting
                item.seedersInt = isNaN(item.seeders) ? 0 : parseInt(item.seeders) // used for torrentDialog2 sorting
                item.leechersInt = isNaN(item.leechers) ? 0 : parseInt(item.leechers) // used for torrentDialog2 sorting
                item.sortname = item.releasename.replace(/\./g, ' ').toLowerCase() // used for torrentDialog2 sorting
              })
              items = results.filter(filterByScore)
              items = items.filter(filterByMinSeeders)
              if ($scope.requireKeywordsModeOR) {
                items = items.filter(filterRequireKeywords)
              }
              items = items.filter(filterIgnoreKeywords)
              items = items.filter(filterBySize)
              // ShowRSS uses the same detailUrl for every episode torrent in a series, so don't dropDuplicates
              if (engine !== 'ShowRSS') {
                items = dropDuplicates(items)
              }
              $scope.items = $scope.items.concat(items)
              $scope.searching = false
            },
            function(e) {
              $scope.searching = false
              if (e !== null && typeof e === 'object' && 'status' in e && 'statusText' in e) {
                var errorText = 'status ' + e.status + ' ' + e.statusText
              } else {
                var errorText = e.toString()
              }
              if ($scope.errorEngine == null) {
                $scope.error = errorText
                $scope.errorEngine = engine
              } else {
                $scope.error = $scope.error + '\n' + errorText
                $scope.errorEngine = $scope.errorEngine + '\n' + engine
              }
              items = null
            })
          }
        })
      }

      // Save state of torrenting minSeeders check-box
      $scope.setMinSeedersState = function() {
        SettingsService.set('torrenting.min_seeders_enabled', $scope.minSeedersEnabled)
        $scope.search($scope.query, undefined, 'seeders.d')
      }

      // Save state of torrenting Require Keywords check-box
      $scope.setRequireKeywordsState = function() {
        SettingsService.set('torrenting.require_keywords_enabled', $scope.requireKeywordsEnabled)
        $scope.search($scope.query, undefined, 'seeders.d')
      }

      // Save state of torrenting ignore keyword check-box
      $scope.setIgnoreKeywordsState = function() {
        SettingsService.set('torrenting.ignore_keywords_enabled', $scope.ignoreKeywordsEnabled)
        $scope.search($scope.query, undefined, 'seeders.d')
      }

      // Save state of torrenting global size min check-box
      $scope.setGlobalSizeMinState = function() {
        SettingsService.set('torrenting.global_size_min_enabled', $scope.globalSizeMinEnabled)
        $scope.search($scope.query, undefined, 'seeders.d')
      }

      // Save state of torrenting global size max check-box
      $scope.setGlobalSizeMaxState = function() {
        SettingsService.set('torrenting.global_size_max_enabled', $scope.globalSizeMaxEnabled)
        $scope.search($scope.query, undefined, 'seeders.d')
      }

      // Changes the search quality while searching for a torrent
      $scope.setQuality = function(quality) {
        $scope.searchquality = quality
        $scope.search($scope.query, undefined, 'seeders.d')
      }

      $scope.cancel = function() {
        $modalInstance.dismiss('Canceled')
      }

      // Toggle advanced filter state
      $scope.toggleShowAdvanced = function() {
        $scope.showAdvanced = !$scope.showAdvanced
        SettingsService.set('torrentDialog.showAdvanced.enabled', $scope.showAdvanced)
      }

      // save active Search Engine states
      $scope.toggleSE = function(name) {
        $scope.activeSE[name] = !$scope.activeSE[name]
        SettingsService.set('torrentDialog.2.activeSE', $scope.activeSE)
        $scope.search($scope.query, undefined, 'seeders.d')
      }

      // Selects and launches magnet
      var magnetSelect = function(magnet, dlPath, label) {
        // console.debug("Magnet selected!", magnet, dlPath, label);
        if (typeof $scope.episode !== 'undefined') { // don't close dialogue if search is free-form
          $modalInstance.close(magnet)
        }

        var channel = $scope.TRAKT_ID !== null ? $scope.TRAKT_ID : $scope.query
        TorrentSearchEngines.launchMagnet(magnet, channel, dlPath, label)
      }

      var urlSelect = function(url, releasename, dlPath, label) {
        // console.debug("Torrent URL selected!", url, dlPath, label);
        if (typeof $scope.episode !== 'undefined') { // don't close dialogue if search is free-form
          $modalInstance.close(url)
        }

        var channel = $scope.TRAKT_ID !== null ? $scope.TRAKT_ID : $scope.query
        window.parseTorrent.remote(url, function(err, torrentDecoded) {
          if (err) {
            throw err
          }
          var infoHash = torrentDecoded.infoHash.getInfoHash()
          $injector.get('$http').get(url, {
            responseType: 'blob'
          }).then(function(result) {
            try {
              TorrentSearchEngines.launchTorrentByUpload(result.data, infoHash, channel, releasename, dlPath, label)
            } catch (E) {
              TorrentSearchEngines.launchTorrentByURL(url, infoHash, channel, releasename, dlPath, label)
            }
          })
        })
      }

      $scope.select = function(result) {
        // console.debug('select', result);
        var dlPath = ($scope.serie) ? $scope.serie.dlPath : null
        var label = ($scope.serie && usingLabel) ? $scope.serie.name : null
        NotificationService.notify(result.releasename,
          'Download started on ' + DuckieTorrent.getClient().getName())
        if (result.magnetUrl) {
          // console.debug('using search magnet');
          return magnetSelect(result.magnetUrl, dlPath, label)
        } else if (result.torrentUrl) {
          // console.debug('using search torrent');
          return urlSelect(result.torrentUrl, result.releasename, dlPath, label)
        } else {
          TorrentSearchEngines.getSearchEngine(result.engine).getDetails(result.detailUrl, result.releasename).then(function(details) {
            if (details.magnetUrl) {
              // console.debug('using details magnet');
              result.magnetUrl = details.magnetUrl
              return magnetSelect(details.magnetUrl, dlPath, label)
            } else if (details.torrentUrl) {
              // console.debug('using details torrent');
              return urlSelect(details.torrentUrl, result.releasename, dlPath, label)
            }
          })
        }
      }

      function openUrl(id, url) {
        // revert back to using iframe, https://github.com/SchizoDuckie/DuckieTV/issues/1308
/*        if (SettingsService.isStandalone() && id === 'magnet') {
          // for standalone, open magnet url direct to os https://github.com/SchizoDuckie/DuckieTV/issues/834
          nw.Shell.openExternal(url)
          // console.debug("Open via OS", id, url);
        } else {*/
          // for chrome extension, open url on chromium via iframe
          var d = document.createElement('iframe')
          d.id = id + 'url_' + new Date().getTime()
          d.style.visibility = 'hidden'
          d.src = url
          document.body.appendChild(d)
          // console.debug("Open via Chromium", d.id, url);
          var dTimer = setInterval(function () {
            var dDoc = d.contentDocument || d.contentWindow.document
            if (dDoc.readyState == 'complete') {
              document.body.removeChild(d)
              clearInterval(dTimer)
              return
            }
          }, 1500)
//        }
      }

      $scope.submitMagnetLink = function(result) {
        if (result.magnetUrl) {
          // we have magnetUrl from search, use it
          openUrl('magnet', result.magnetUrl)
        } else {
          // we don't have magnetUrl from search, fetch from details instead
          TorrentSearchEngines.getSearchEngine(result.engine).getDetails(result.detailUrl, result.releasename).then(function(details) {
            if (details.magnetUrl) {
              result.magnetUrl = details.magnetUrl
              openUrl('magnet', details.magnetUrl)
            }
          })
        }
        return result
      }

      $scope.submitTorrentLink = function(result) {
        if (result.torrentUrl) {
          // we have torrentUrl from search, use it
          openUrl('torrent', result.torrentUrl)
        } else {
          // we don't have torrentUrl from search, fetch from details instead
          TorrentSearchEngines.getSearchEngine(result.engine).getDetails(result.detailUrl, result.releasename).then(function(details) {
            if (details.torrentUrl) {
              openUrl('torrent', details.torrentUrl)
            }
          })
        }
      }

      $scope.search($scope.query, undefined, 'seeders.d')
    }
  ])

  .directive('torrentDialog2', ['TorrentSearchEngines', '$filter', 'SettingsService',
    function(TorrentSearchEngines, $filter, SettingsService) {
      if (!SettingsService.get('torrenting.enabled')) {
        // if torrenting features are disabled hide
        return {
          template: '<a></a>'
        }
      } else {
        return {
          restrict: 'E',
          transclude: true,
          wrap: true,
          replace: true,
          scope: {
            q: '=q',
            TRAKT_ID: '=traktid',
            serie: '=serie',
            episode: '=episode'
          },
          template: '<a class="torrent-dialog" ng-click="openDialog()" uib-tooltip="{{getTooltip()}}"><i class="glyphicon glyphicon-download"></i><span ng-transclude></span></a>',
          controller: ['$scope',
            function($scope) {
              // Translates the tooltip
              $scope.getTooltip = function() {
                if ($scope.q) {
                  return $filter('translate')('TORRENTDIALOG/search-download-this/tooltip') + $scope.q
                } else if ($scope.episode && $scope.serie) {
                  return $filter('translate')('TORRENTDIALOG/search-download-this/tooltip') + $scope.serie.name + ' ' + $scope.episode.getFormattedEpisode()
                } else {
                  return $filter('translate')('TORRENTDIALOG/search-download-any/tooltip')
                }
              }
              // Opens the torrent search with the episode selected
              $scope.openDialog = function() {
                if ($scope.serie && $scope.episode) {
                  TorrentSearchEngines.findEpisode($scope.serie, $scope.episode)
                } else {
                  TorrentSearchEngines.search($scope.q, $scope.TRAKT_ID)
                }
              }
            }
          ]
        }
      }
    }
  ])
;
DuckieTV
/**
 * Torrent Remote Control Directive
 */
  .directive('torrentRemoteControl', ['DuckieTorrent', 'TorrentHashListService',
    function(DuckieTorrent, TorrentHashListService) {
      return {
        restrict: 'E',
        transclude: true,
        replace: false,
        scope: {
          infoHash: '=infoHash',
          templateUrl: '=templateUrl',
          episodeDownloaded: '=downloaded'
        },
        templateUrl: function($node, $iAttrs) {
          return $iAttrs.templateUrl
        },
        controllerAs: 'remote',
        controller: ['$scope', '$rootScope',
          function($scope, $rootScope) {
            var remote = this
            remote.infoHash = $scope.infoHash
            remote.torrent = null
            remote.isConnected = false

            this.getFiles = function(torrent) {
              remote.torrent.getFiles().then(function(files) {
                remote.torrent_files = files.map(function(file) {
                  file.isMovie = file.name.substring(file.name.length - 3).match(/mp4|avi|mkv|mpeg|mpg|flv|ts/g)
                  if (file.isMovie) {
                    file.searchFileName = file.name.split('/').pop().split(' ').pop()
                  }
                  return file
                })
              })
            }

            /**
                     * Observes the torrent and watches for changes (progress)
                     */
            function observeTorrent(rpc, infoHash) {
              DuckieTorrent.getClient().getRemote().onTorrentUpdate(infoHash, function(newData) {
                remote.torrent = newData
                $scope.$applyAsync()
              })
            }

            // If the connected info hash changes, remove the old event and start observing the new one.
            $scope.$watch('infoHash', function(newVal, oldVal) {
              if (newVal == oldVal) return
              remote.infoHash = newVal
              DuckieTorrent.getClient().AutoConnect().then(function(rpc) {
                remote.torrent = DuckieTorrent.getClient().getRemote().getByHash(remote.infoHash)
                DuckieTorrent.getClient().getRemote().offTorrentUpdate(oldVal, observeTorrent)
                observeTorrent(rpc, remote.infoHash)
              })
            })

            /**
                     * Auto connect and wait for initialisation, then start monitoring updates for the torrent hash in the infoHash
                     */
            DuckieTorrent.getClient().AutoConnect().then(function(rpc) {
              remote.isConnected = true
              remote.torrent = DuckieTorrent.getClient().getRemote().getByHash(remote.infoHash)
              observeTorrent(rpc, remote.infoHash)
              if (DuckieTorrent.getClient().getName() === 'uTorrent') {
                remote.cleanupHashCheck()
              }
            }, function(fail) {
              // Failed to connect to torrent client for monitoring. Creating an event watcher for when torrent client is connected.
              $rootScope.$on('torrentclient:connected', function(rpc) {
                remote.isConnected = true
                remote.torrent = DuckieTorrent.getClient().getRemote().getByHash(remote.infoHash)
                observeTorrent(rpc, remote.infoHash)
                if (DuckieTorrent.getClient().getName() === 'uTorrent') {
                  remote.cleanupHashCheck()
                }
              })
            })

            this.cleanupHashCheck = function() {
              /**
                         * clean up when torrent has not been found in torrent-client
                         * exception: when using launch_via_chromium, only do the check when the torrent has downloaded
                         * otherwise we could delete DuckieTV's infoHash before the user has completed the add-new-torrent dialogue on the TorrentHost
                        **/
              setTimeout(function() {
                var lvc = $rootScope.getSetting('torrenting.launch_via_chromium')
                if ((!lvc) || (lvc && $scope.episodeDownloaded)) {
                  DuckieTorrent.getClient().hasTorrent(remote.infoHash).then(function(hasTorrent) {
                    if (!hasTorrent) {
                      TorrentHashListService.removeFromHashList(remote.infoHash)
                      Episode.findOneByMagnetHash(remote.infoHash).then(function(result) {
                        if (result) {
                          console.info('remote torrent not found, removed magnetHash[%s] from episode[%s] of series[%s]', result.magnetHash, result.getFormattedEpisode(), result.ID_Serie)
                          result.magnetHash = null
                          result.Persist()
                        }
                      })
                    }
                  })
                }
              }, 5000)
            }
          }
        ]
      }
    }
  ])
;
// Source: https://github.com/Templarian/ui.bootstrap.contextMenu

/** Usage:
 * [string/function, function, optional function]
 * menuOptions = function () {
 *    return [
 *       ['name', action, disabled]
 *    ];
 * };
 *
 * serieOptions = function (serie) {
 *    return [
 *       ['Remove serie', function() { remove(serie) }],
 *       [$filter(translate)(thingy), function() { doThing(serie) }, function() { return false; }]
 *    ];
 * };
 * Note: you can add , null, between options to add a divider
 **/

DuckieTV.directive('contextMenu', [function () {
  var renderContextMenu = function ($scope, event, options, model) {
    if (!$) { var $ = angular.element }
    var currentTarget = $(event.currentTarget)
    currentTarget.addClass('context')
    var $contextMenu = $('<div>')
    $contextMenu.addClass('dropdown clearfix context-menu')
    var $ul = $('<ul>')
    $ul.addClass('dropdown-menu')
    $ul.attr({ 'role': 'menu' })
    $ul.css({
      display: 'block',
      position: 'absolute',
      left: event.pageX + 'px',
      top: event.pageY + 'px'
    })
    angular.forEach(options, function (item, i) {
      var $li = $('<li>')
      if (item === null) {
        $li.addClass('divider')
      } else {
        var $a = $('<a>')
        $a.attr({ tabindex: '-1', href: '#' })
        var text = typeof item[0] === 'string' ? item[0] : item[0].call($scope, $scope, event, model)
        $a.text(text)
        $li.append($a)
        var enabled = angular.isDefined(item[2]) ? item[2].call($scope, $scope, event, text, model) : true
        if (enabled) {
          $li.on('click', function ($event) {
            $event.preventDefault()
            $scope.$apply(function () {
              currentTarget.removeClass('context')
              $contextMenu.remove()
              item[1].call($scope, $scope, event, model)
            })
          })
        } else {
          $li.on('click', function ($event) {
            $event.preventDefault()
          })
          $li.addClass('disabled')
        }
      }
      $ul.append($li)
    })
    $contextMenu.append($ul)
    var height = Math.max(
      document.body.scrollHeight, document.documentElement.scrollHeight,
      document.body.offsetHeight, document.documentElement.offsetHeight,
      document.body.clientHeight, document.documentElement.clientHeight
    )
    $contextMenu.css({
      width: '100%',
      height: height + 'px',
      position: 'absolute',
      top: 0,
      left: 0,
      zIndex: 9999
    })
    $(document).find('body').append($contextMenu)
    $contextMenu.on('mousedown', function (e) {
      if ($(e.target).hasClass('dropdown')) {
        currentTarget.removeClass('context')
        $contextMenu.remove()
      }
    }).on('contextmenu', function (event) {
      currentTarget.removeClass('context')
      event.preventDefault()
      $contextMenu.remove()
    })
  }
  return function ($scope, element, attrs) {
    element.on('contextmenu', function (event) {
      event.stopPropagation()
      $scope.$apply(function () {
        event.preventDefault()
        var options = $scope.$eval(attrs.contextMenu)
        var model = $scope.$eval(attrs.model)
        if (options instanceof Array) {
          if (options.length === 0) { return }
          renderContextMenu($scope, event, options, model)
        } else {
          throw '"' + attrs.contextMenu + '" not an array'
        }
      })
    })
  }
}])
;
/**
 * BackupService is injected whenever a backup is requested
 *
 * The backup format is a simple JSON file that has the following structure:
 *
 * {
 * "settings": {
 *   "useTrakt_id": true // included in versions after 1.1.5 to indicate that the series id key in the backup is the trakt_id instead of tvdb_id
 *   // serialized settings
 * },
 * "series": {
 *  <SHOW_TVDB_ID>||<SHOW_TRAKT_ID> : [ // array of objects
 *      {
 *          "displaycalendar": 1||0,
 *          "autoDownload": 1||0,
 *          "customSearchString": <string>||null,
 *          "ignoreGlobalQuality": 1||0,
 *          "ignoreGlobalIncludes": 1||0,
 *          "ignoreGlobalExcludes": 1||0,
 *          "searchProvider": <string>||null,
 *          "ignoreHideSpecials": 1||0,
 *          "customSearchSizeMin": <integer>||null,
 *          "customSearchSizeMax": <integer>||null,
 *          "dlPath": <string>||null,
 *          "customDelay": <integer>||null,
 *          "alias": <string>||null,
 *          "customFormat": <string>||null,
 *          "customSeeders": <integer>||null,
 *          "customIncludes": <string>||null,
 *          "customExcludes": <string>||null,
 *          "customSeeders": <integer>||null
 *      },
 *      {
 *          "TVDB_ID": <Episode_TVDB_ID>, // included in versions upto 1.1.5
 *          "TRAKT_ID": <Episode_TRAKT_ID>, // included after 1.1.5
 *          "watchedAt": <timestamp watchedAt>||null,
 *          "downloaded": 1
 *      },
 *      // repeat
 *    ],
 *    // repeat
 *  }
 */
DuckieTV.factory('BackupService', ['TorrentSearchEngines', function(TorrentSearchEngines) {
  var service = {
    createBackup: function() {
      // Fetch all the series
      return CRUD.executeQuery('select Series.TRAKT_ID, Series.displaycalendar, Series.autoDownload, Series.customSearchString, Series.ignoreGlobalQuality, Series.ignoreGlobalIncludes, Series.ignoreGlobalExcludes, Series.searchProvider, Series.ignoreHideSpecials, Series.customSearchSizeMin, Series.customSearchSizeMax, Series.dlPath, Series.customDelay, Series.alias, Series.customFormat, Series.customIncludes, Series.customExcludes, Series.customSeeders from Series').then(function(series) {
        var out = {
          settings: {},
          series: {}
        }
        // flag indicating series id is a trakt_id and not a tvdb_id (included in versions after 1.1.5)
        out.settings['useTrakt_id'] = true
        /*
        * grab Jackett from cache and convert into pseudo localStorage for saving into the backup's _settings_ section
        * this allows us to maintain backward compatibility with older DuckieTV versions
        */
        out.settings['jackett'] = JSON.stringify(TorrentSearchEngines.jackettCache)
        // Store all the settings
        for (var i = 0; i < localStorage.length; i++) {
          if (localStorage.key(i) == 'jackett') continue
          if (localStorage.key(i).indexOf('database.version') > -1) continue
          if (localStorage.key(i).indexOf('trakttv.trending.cache') > -1) continue
          if (localStorage.key(i).indexOf('trakttv.lastupdated.trending') > -1) continue
          if (localStorage.key(i).indexOf('snrt.name-exceptions') > -1) continue
          if (localStorage.key(i).indexOf('snrt.date-exceptions') > -1) continue
          if (localStorage.key(i).indexOf('snrt.traktid-tvdbid-xref') > -1) continue
          if (localStorage.key(i).indexOf('snrt.lastFetched') > -1) continue
          out.settings[localStorage.key(i)] = localStorage.getItem(localStorage.key(i))
        }

        // Store all the series
        series.rows.map(function(serie) {
          out.series[serie.TRAKT_ID] = []
          out.series[serie.TRAKT_ID].push({
            'displaycalendar': serie.displaycalendar || 0,
            'autoDownload': serie.autoDownload || 0,
            'customSearchString': serie.customSearchString,
            'ignoreGlobalQuality': serie.ignoreGlobalQuality,
            'ignoreGlobalIncludes': serie.ignoreGlobalIncludes,
            'ignoreGlobalExcludes': serie.ignoreGlobalExcludes,
            'searchProvider': serie.searchProvider,
            'ignoreHideSpecials': serie.ignoreHideSpecials,
            'customSearchSizeMin': serie.customSearchSizeMin,
            'customSearchSizeMax': serie.customSearchSizeMax,
            'dlPath': serie.dlPath,
            'customDelay': serie.customDelay,
            'alias': serie.alias,
            'customFormat': serie.customFormat,
            'customIncludes': serie.customIncludes,
            'customExcludes': serie.customExcludes,
            'customSeeders': serie.customSeeders
          })
        })

        // Store watched episodes for each serie
        return CRUD.executeQuery('select Series.TRAKT_ID, Episodes.TRAKT_ID as epTRAKT_ID, Episodes.watchedAt, Episodes.downloaded from Series left join Episodes on Episodes.ID_Serie = Series.ID_Serie where Episodes.downloaded == 1 or  Episodes.watchedAt is not null').then(function(res) {
          res.rows.map(function(row) {
            var watchedAt = (row.watchedAt) ? new Date(row.watchedAt).getTime() : null
            out.series[row.TRAKT_ID].push({
              'TRAKT_ID': row.epTRAKT_ID,
              'watchedAt': watchedAt,
              'downloaded': row.downloaded
            })
          })

          var blob = new Blob([angular.toJson(out, true)], {
            type: 'text/json'
          })

          return blob
        })
      })
    }
  }

  return service
}])

/**
 * at start-up set up a timer for the autoBackup
 */
DuckieTV.run(['BackupService', 'SettingsService', 'FavoritesService', 'dialogs',
  function(BackupService, SettingsService, FavoritesService, dialogs) {
    /*
    * creates timer to schedule an autoBackup
    */
    var scheduleAutoBackup = function() {
      setTimeout(function() {
        // wait for FavoritesService to be available
        if (FavoritesService.initialized == true) {
          // only do the backup if there are shows in favorites.
          if (FavoritesService.favoriteIDs.length !== 0) {
            if (timeToNextBackup == 60000) {
              console.info('Scheduled autoBackup run at ', new Date())
              dialogs.create('templates/dialogs/backup.html', 'backupDialogCtrl', {}, {
                size: 'lg'
              })
            }
          } else {
            console.info('autoBackup is not required as there are no shows in favourites yet.')
          }
        } else {
          setTimeout(function() {
            scheduleAutoBackup()
          }, 1000)
        }
      }, timeToNextBackup)
    }

    var autoBackupPeriod = SettingsService.get('autobackup.period')
    if (autoBackupPeriod === 'never') {
      console.warn('autoBackup is set to never be scheduled')
      return // autoBackup is not requested
    }

    // init last run time if not defined
    var localDT = new Date().getTime()
    if (!localStorage.getItem('autobackup.lastrun')) {
      localStorage.setItem('autobackup.lastrun', localDT)
    }

    // determine next run time
    var lastRun = new Date(parseInt(localStorage.getItem('autobackup.lastrun')))
    var nextBackupDT = null

    switch (autoBackupPeriod) {
      case 'daily':
        nextBackupDT = new Date(lastRun.getFullYear(), lastRun.getMonth(), lastRun.getDate() + 1, lastRun.getHours(), lastRun.getMinutes(), lastRun.getSeconds()).getTime()
        break
      case 'weekly':
        nextBackupDT = new Date(lastRun.getFullYear(), lastRun.getMonth(), lastRun.getDate() + 7, lastRun.getHours(), lastRun.getMinutes(), lastRun.getSeconds()).getTime()
        break
      case 'monthly':
        nextBackupDT = new Date(lastRun.getFullYear(), lastRun.getMonth() + 1, lastRun.getDate(), lastRun.getHours(), lastRun.getMinutes(), lastRun.getSeconds()).getTime()
        break
      default:
        console.error('unexpected autoBackupPeriod', autoBackupPeriod)
    }

    // schedule the timer for the next backup
    var timeToNextBackup = (nextBackupDT - localDT)
    if (timeToNextBackup > 0) {
      console.info('The next autoBackup is scheduled for', new Date(parseInt(nextBackupDT)))
    } else {
      timeToNextBackup = 60000 // the auto-backup will be started in a minute, to allow for start-up processes to complete.
    }

    scheduleAutoBackup()
  }
])
;
DuckieTV.factory('BaseHTTPApi', ['$http',
  function($http) {
    var BaseHTTPApi = function() {
      this.config = {
        server: null,
        port: null,
        username: null,
        use_auth: null,
        uses_custom_auth_method: false
      }

      this.endpoints = {
        torrents: null,
        portscan: null,
        addmagnet: null
      }
    }

    /**
     * Fetches the url, auto-replaces the port in the url if it was found.
     */
    BaseHTTPApi.prototype.getUrl = function(type, param) {
      var out = this.config.server + ':' + this.config.port + this.endpoints[type]
      return out.replace('%s', encodeURIComponent(param))
    }

    /**
     * Build a JSON request using the URLBuilder service.
     * @param string type url to fetch from the request types
     * @param object params GET parameters
     * @param object options $http optional options
     */
    BaseHTTPApi.prototype.request = function(type, params, options) {
      params = params || {}
      var url = this.getUrl(type, params)
      var httpOptions = this.config.use_auth ? {
        headers: {
          Authorization: [this.config.username, this.config.password]
        }
      } : {}
      return $http.get(url, httpOptions)
    }

    return BaseHTTPApi
  }
])
;
var DuckieTorrent = angular.module('DuckieTorrent.torrent', ['DuckieTV'])
/**
 * Generic DuckieTorrent abstraction layer.
 * Torrent clients register themselves in the app.run block and you get a handle to them by using getClient();
 */
DuckieTorrent.provider('DuckieTorrent', function() {
  var clients = {}
  this.$get = function() {
    return {
      getClients: function() {
        return clients
      },

      register: function(name, client) {
        console.info('Registering torrent client: ' + name)
        clients[name] = client
      },

      getClient: function() {
        return clients[localStorage.getItem('torrenting.client')]
      },

      getClientName: function() {
        return localStorage.getItem('torrenting.client')
      }
    }
  }
})

/**
 * Angular's private URL Builder method + unpublished dependencies converted to a public service
 * So we can properly build a GET url with parameters for a JSONP request.
 */
DuckieTV.provider('URLBuilder', function() {
  function encodeUriQuery(val, pctEncodeSpaces) {
    return encodeURIComponent(val)
      .replace(/%40/gi, '@')
      .replace(/%3A/gi, ':')
      .replace(/%24/g, '$')
      .replace(/%2C/gi, ',')
      .replace(/%20/g, (pctEncodeSpaces ? '%20' : '+'))
  }

  /**
   * Angular's private buildUrl function, patched to refer to the public methods on the angular globals
   */
  function buildUrl(url, params) {
    if (!params) return url
    var parts = []
    angular.forEach(params, function(value, key) {
      if (value === null || angular.isUndefined(value)) return
      if (!angular.isArray(value)) value = [value]

      angular.forEach(value, function(v) {
        if (angular.isObject(v)) {
          v = angular.toJson(v)
        }
        parts.push(encodeUriQuery(key) + '=' + encodeUriQuery(v))
      })
    })
    return url + ((url.indexOf('?') == -1) ? '?' : '&') + parts.join('&')
  }

  this.$get = function() {
    return {
      build: function(url, params) {
        return buildUrl(url, params)
      }
    }
  }
})

String.capitalize = function(s) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * Simple recursive object merge that merges everyting from obj2 into obj1 and recurses until it can't go any deeper.
 */
Object.deepMerge = function(obj1, obj2) {
  for (var i in obj2) { // add the remaining properties from object 2
    if (typeof obj2[i] !== 'object') {
      obj1[i] = obj2[i]
    } else {
      obj1[i] = Object.deepMerge(i in obj1 ? obj1[i] : {}, obj2[i])
    }
  }
  return obj1
}
;
/**
 * The CalendarEvents service provides storage and retrieve functions
 * for episodes that are displayed on the calendar. It has built-in cache
 * and watches for the calendar changing it's date before fetching a new
 * set of episodes from the database
 */
DuckieTV.factory('CalendarEvents', ['$rootScope', 'FavoritesService', 'SettingsService',
  function($rootScope, FavoritesService, SettingsService) {
    var calendarEvents = {}
    var seriesForDate = {}
    var calendarEpisodeSortCache = {}
    var calendarStartDate = null
    var calendarEndDate = null
    var showSpecials = SettingsService.get('calendar.show-specials')

    /* #843
        $rootScope.$on("storage:update", function() {
            console.log("Calendar detected that storage was updated removing deleted.");
            service.removeDeleted();
        }.bind(this))
    */

    /**
     * Check if an episode already exists on a date in the calendar.
     */
    function hasEvent(date, event) {
      return calendarEvents[date].filter(function(el) {
        return el.episode.getID() == event.episode.getID()
      }).length > 0
    }

    /**
     * Add an event to the calendar if it's not already there.
     */
    function addEvent(date, event) {
      if (!hasEvent(date, event)) {
        calendarEvents[date].push(event)
        calendarEvents[date].sort(calendarEpisodeSort)
        if (!(event.ID_Serie in seriesForDate[date])) {
          seriesForDate[date][event.ID_Serie] = []
        }
        seriesForDate[date][event.ID_Serie].push(event)
        delete calendarEpisodeSortCache[date]
      }
    }

    /**
     * Sort the episodes for a specific date.
     * First by air time, then by episode number if multiple episodes for a serie,
     * then by title if multiple series at the same time.
     */
    function calendarEpisodeSort(a, b) {
      if (a.serie == null || b.serie == null) {
        return 0
      }
      var ad = new Date(a.episode.firstaired_iso).getTime()
      var bd = new Date(b.episode.firstaired_iso).getTime()
      if (ad < bd) return -1
      else if (ad > bd) return 1
      else {
        // air at the same time, now order by title first and if the names match by episode
        if (a.ID_Serie == b.ID_Serie) {
          if (a.episode.episodenumber < b.episode.episodenumber) return -1
          if (a.episode.episodenumber > b.episode.episodenumber) return 1
        } else {
          return a.serie.name > b.serie.name
        }
      }
    }

    /**
     * If the episode exist in other dates in the calendarEvents object, remove it.
     */
    function deleteDuplicates(duplicateID, eventDate) {
      for (var aDate in calendarEvents) {
        if (aDate !== eventDate) {
          var eventList = calendarEvents[aDate]
          for (var index = eventList.length - 1; index > -1; index--) {
            if (eventList[index].episodeID === duplicateID) {
              calendarEvents[aDate].splice(index, 1)
              delete seriesForDate[aDate][eventList[index].TRAKT_ID]
              return
            }
          }
        }
      }
    }

    var service = {
      /**
       * Remove shows that were deleted from the database from the calendar.
       */
      removeDeleted: function() {
        Object.keys(calendarEvents).map(function(date) {
          var eventList = calendarEvents[date]
          for (var index = eventList.length - 1; index > -1; index--) {
            if (FavoritesService.favoriteIDs.indexOf(eventList[index].serie.TRAKT_ID.toString()) == -1) {
              calendarEvents[date].splice(index, 1)
            }
          }

          eventList = calendarEpisodeSortCache[date]
          if (!eventList) return

          for (index = eventList.length - 1; index > -1; index--) {
            if (FavoritesService.favoriteIDs.indexOf(eventList[index][0].serie.TRAKT_ID.toString()) == -1) {
              calendarEpisodeSortCache[date].splice(index, 1)
            }
          }
        })
      },
      getAllEvents: function() {
        return calendarEvents
      },
      /**
       * setVisibleDays function is called from the calendar directive.
       * It fills the CalendarEvents with days that are currently on display and makes sure
       * that days that are not currently displayed are purged from cache
       */
      setVisibleDays: function(range) {
        if (!range || range.length == 1 && range[0].length == 1) return
        var dates = []
        calendarStartDate = new Date(range[0][0])
        calendarEndDate = new Date((range[range.length - 1][range[range.length - 1].length - 1].getTime()) + 86399999) // add 23:59:59 to endDate
        calendarEvents = {}
        seriesForDate = {}
        range.map(function(week) {
          week.map(function(day) {
            day = new Date(day).toDateString()
            dates.push(day)
            if (!(day in calendarEvents)) {
              calendarEvents[day] = []
              seriesForDate[day] = {}
            }
          })
        })
        Object.keys(calendarEvents).map(function(day) {
          if (dates.indexOf(day) == -1) {
            delete calendarEvents[day]
            delete seriesForDate[day]
          }
        })
        service.getEventsForDateRange(calendarStartDate, calendarEndDate)
      },

      /**
       * Optimized function to feed the calendar it's data.
       * Fetches the episodes for a date range and the relevant series for it. Then caches and refreshes the calendar
       * @param  Date start startDate
       * @param  Date end endDate
       */
      getEventsForDateRange: function(start, end) {
        // fetch episodes between 2 timestamps
        return FavoritesService.getEpisodesForDateRange(start.getTime(), end.getTime()).then(function(episodes) {
          // iterate all the episodes and bind it together with the serie into an event array
          return service.setEvents(episodes.map(function(episode) {
            return {
              start: new Date(episode.firstaired),
              ID_Serie: episode.ID_Serie,
              serie: FavoritesService.getByID_Serie(episode.ID_Serie),
              episode: episode
            }
          }))
        })
      },
      clearCache: function() {
        calendarStartDate = null
        calendarEndDate = null
        calendarEvents = {}
      },

      /**
       * Merge any incoming new events with the events already in calendarEvents.
       * Removes any mention of the episode that already exists and then adds the new one.
       * The calendarEvents cache is updated per day so the calendar doesn't refresh unnecessarily
       */
      setEvents: function(events) {
        service.removeDeleted()
        events.map(function(event) {
          var date = new Date(event.start).toDateString()
          if (!(date in calendarEvents)) {
            return
          }
          deleteDuplicates(event.episode.getID(), date)
          if ((!showSpecials && event.episode.seasonnumber > 0) || showSpecials || event.serie.ignoreHideSpecials == 1) {
            addEvent(date, event)
          }
        })
        $rootScope.$applyAsync()
      },

      processEpisodes: function(serie, episodes) {
        Object.keys(episodes).map(function(id) {
          var date = new Date(new Date(episodes[id].firstaired).getTime()).toDateString()
          if (!(date in calendarEvents)) return
          if (episodes[id].seasonnumber == 0 && !showSpecials) return

          addEvent(date, {
            start: new Date(episodes[id].firstaired),
            ID_Serie: episodes[id].ID_Serie,
            serie: serie,
            episode: episodes[id]
          })
        })
        $rootScope.$applyAsync()
      },
      /**
       * Check if an event exists at the given date
       */
      hasEvent: function(date) {
        return (new Date(date).toDateString() in calendarEvents)
      },

      markDayWatched: function(day, rootScope, downloadedPaired) {
        var str = day instanceof Date ? day.toDateString() : new Date(day).toDateString()
        if (str in calendarEvents) {
          calendarEvents[str].map(function(calEvent) {
            if (calEvent.episode.hasAired()) {
              calEvent.episode.markWatched(downloadedPaired, rootScope)
            }
          })
        }
      },
      markDayDownloaded: function(day, rootScope) {
        var str = day instanceof Date ? day.toDateString() : new Date(day).toDateString()
        if (str in calendarEvents) {
          calendarEvents[str].map(function(calEvent) {
            if (calEvent.episode.hasAired()) {
              calEvent.episode.markDownloaded(rootScope)
            }
          })
        }
      },
      /**
       * Return events for a date or an empty array
       */
      getEvents: function(date) {
        var str = date instanceof Date ? date.toDateString() : new Date(date).toDateString()
        return (str in calendarEvents) ? calendarEvents[str] : []
      },

      getTodoEvents: function() {
        var dates = Object.keys(calendarEvents)
        var date = new Date(dates[12])

        var y = date.getFullYear()

        var m = date.getMonth()

        var currentMonth = new Date().getMonth()
        var firstDay = new Date(y, m, 1).getTime()
        var today = currentMonth == m ? new Date().setHours(23, 59, 59, 999) : new Date(y, m + 1, 0).setHours(23, 59, 59, 999)
        var eps = []
        dates.forEach(function(day) {
          calendarEvents[day].forEach(function(event) {
            var startTime = event.start.getTime()
            if (event.serie && startTime >= firstDay && startTime < today && !event.episode.isWatched() && event.serie.displaycalendar) {
              eps.push(event)
            }
          })
        })
        return eps
      },
      /**
       * Sort the series for a day, that are now grouped by ID_Serie. It needs to return
       * an array (so that it can be sorted) instead of an object, and cache it, for angular.
       * Cache is cleared and regenerated when an episode is added to the list.
       */
      getSeries: function(date) {
        var str = date instanceof Date ? date.toDateString() : new Date(date).toDateString()
        if (!(str in calendarEpisodeSortCache)) { // no cache yet?
          var seriesForDay = seriesForDate[str] || {}
          calendarEpisodeSortCache[str] = Object.keys(seriesForDay).map(function(serieId) { // turn the object into an array
            return seriesForDay[serieId]
          }).sort(function(a, b) {
            return calendarEpisodeSort(a[0], b[0]) // and sort it by the first item in it.
          })
        }
        return calendarEpisodeSortCache[str]
      }
    }

    return service
  }
])
;
/**
 * The AutoDownloadService checks if a download is available for a TV-Show that's aired
 * and automatically downloads the first search result if it passes all the filters and more than minSeeders seeders are available.
 * SE must have magnets as we need the torrentHash to track progress. magnets on details page are supported.
 */
DuckieTV.factory('AutoDownloadService', ['$rootScope', '$injector', '$filter', 'FavoritesService', 'SceneNameResolver', 'SettingsService', 'TorrentSearchEngines', 'DuckieTorrent', 'NotificationService',
  function($rootScope, $injector, $filter, FavoritesService, SceneNameResolver, SettingsService, TorrentSearchEngines, DuckieTorrent, NotificationService) {
    var service = {
      checkTimeout: null,
      activityList: [],
      fromDT: null,
      toDT: null,

      activityUpdate: function(serie, episode, search, status, extra) {
        var csm = 0
        var searchExtra = ''
        if (serie.customSearchSizeMin && serie.customSearchSizeMin != null) {
          csm = 1
          searchExtra = ' (' + serie.customSearchSizeMin.toString() + '/'
        } else {
          searchExtra = ' (-/'
        }
        if (serie.customSearchSizeMax && serie.customSearchSizeMax != null) {
          csm = 1
          searchExtra = searchExtra + serie.customSearchSizeMax.toString() + ')'
        } else {
          searchExtra = searchExtra + '-)'
        }
        if (csm == 0) {
          searchExtra = ''
        }
        var css = (serie.customSearchString && serie.customSearchString != '') ? 1 : 0
        var cs = (serie.customSeeders && serie.customSeeders != null) ? 1 : 0
        if (cs) searchExtra = searchExtra + ' [' + serie.customSeeders + ']'
        var ci = (serie.customIncludes && serie.customIncludes != null) ? 1 : 0
        if (ci) searchExtra = searchExtra + ' {' + serie.customIncludes + '}'
        var ce = (serie.customExcludes && serie.customExcludes != null) ? 1 : 0
        if (ce) searchExtra = searchExtra + ' <' + serie.customExcludes + '>'
        var sp = (serie.searchProvider && serie.searchProvider != null) ? ' (' + serie.searchProvider + ')' : ''
        service.activityList.push({
          'search': search,
          'searchProvider': sp,
          'searchExtra': searchExtra,
          'csm': csm,
          'css': css,
          'cs': cs,
          'ci': ci,
          'ce': ce,
          'ipq': serie.ignoreGlobalQuality,
          'irk': serie.ignoreGlobalIncludes,
          'iik': serie.ignoreGlobalExcludes,
          'status': status,
          'extra': extra,
          'serie': serie,
          'episode': episode
        })
        $rootScope.$broadcast('autodownload:activity')
      },

      autoDownloadCheck: function() {
        if (SettingsService.get('torrenting.autodownload') === false) {
          service.detach()
          return
        }

        service.activityList = []
        var period = parseInt(SettingsService.get('autodownload.period')) // Period to check for updates up until today current time, default 1
        var settingsDelay = parseInt(SettingsService.get('autodownload.delay')) // Period in minutes to wait after episode has aired before auto-downloading, default 15m
        var lastRun = SettingsService.get('autodownload.lastrun')

        var from = new Date()
        if (lastRun) {
          from = new Date(lastRun)
        }
        from.setDate(from.getDate() - period) // subtract autodownload period from lastrun for if some episodes weren't downloaded.
        from.setHours(0)
        from.setMinutes(0)
        from.setSeconds(0)
        service.toDT = new Date().getTime()
        service.fromDT = from.getTime()
        $rootScope.$broadcast('autodownload:activity')
        var showSpecials = SettingsService.get('calendar.show-specials')

        if (DuckieTorrent.getClient().isConnected()) {
          DuckieTorrent.getClient().AutoConnect().then(function(remote) {
            // Get the list of episodes that have aired since period, and iterate them.
            FavoritesService.getEpisodesForDateRange(service.fromDT, service.toDT).then(function(candidates) {
              candidates.map(function(episode) {
                CRUD.FindOne('Serie', {
                  ID_Serie: episode.ID_Serie
                }).then(function(serie) {
                  var serieEpisode = serie.name + ' ' + episode.getFormattedEpisode()
                  // filter out episode from torrent search
                  if (episode.seasonnumber === 0 && !showSpecials && serie.ignoreHideSpecials !== 1) {
                    service.activityUpdate(serie, episode, serieEpisode, 3, ' HS') // 'autoDL disabled HS'
                    return // user has chosen not to show specials on calendar so we assume they do not expect them to be auto-downloaded
                  }
                  if (serie.displaycalendar !== 1) {
                    service.activityUpdate(serie, episode, serieEpisode, 3, ' HC') // 'autoDL disabled HC'
                    return // user has chosen not to show series on calendar so we assume they do not expect them to be auto-downloaded
                  }
                  if (episode.isDownloaded()) {
                    service.activityUpdate(serie, episode, serieEpisode, 0) // 'downloaded'
                    return // if the episode was already downloaded, skip it.
                  }
                  if (episode.watchedAt !== null) {
                    service.activityUpdate(serie, episode, serieEpisode, 1) // 'watched'
                    return // if the episode has been marked as watched, skip it.
                  }
                  if (episode.magnetHash !== null && (episode.magnetHash in remote.torrents)) {
                    service.activityUpdate(serie, episode, serieEpisode, 2) // 'has magnet'
                    return // if the episode already has a magnet, skip it.
                  }

                  /**
                   * is episode onair? don't go looking for torrent yet. (saves pointless broadband usage)
                   * default onair end-time is calculated as firstaired + runtime minutes + delay minutes
                   * if firstaired < 1 or null default to (now - runtime - delay) (i.e. force looking for torrent)
                   * if runtime is null defaults to 60mins
                   * delay defaults to 15mins in settings
                   */
                  var delay = (serie.customDelay) ? parseInt(serie.customDelay) : settingsDelay // override settings delay with series custom delay if used
                  delay = (delay > (period * 24 * 60)) ? period * 24 * 60 : delay // sanity check.  Period could have changed after serie.CustomDelay was set.
                  var epfa = (episode.firstaired !== null && episode.firstaired > 0) ? new Date(episode.firstaired) : service.toDT - runtime - delay
                  var runtime = (serie.runtime) ? parseInt(serie.runtime) : 60
                  var episodeAired = new Date(epfa.getFullYear(), epfa.getMonth(), epfa.getDate(), epfa.getHours(), epfa.getMinutes() + runtime + delay, epfa.getSeconds()).getTime()
                  if (episodeAired > service.toDT) {
                    var totalMinutesToGo = ((episodeAired - service.toDT) / 1000 / 60)
                    var dhm = totalMinutesToGo.minsToDhm()
                    if (totalMinutesToGo < (24 * 60)) {
                      dhm = dhm.substr(2) // less that 24 hours, strip the leading days
                    }
                    service.activityUpdate(serie, episode, serieEpisode, 8, ' ' + dhm) // 'onair + delay'
                    return // the episode is broadcasting right now
                  }

                  if (serie.autoDownload == 1) {
                    service.autoDownload(serie, episode)
                  } else {
                    service.activityUpdate(serie, episode, serieEpisode, 3) // 'autoDL disabled'
                  }
                })
              })

              SettingsService.set('autodownload.lastrun', new Date().getTime())
              $rootScope.$broadcast('autodownload:activity')
            })
          })
        }

        service.detach()
        service.checkTimeout = setTimeout(service.autoDownloadCheck, 1000 * 60 * 15) // fire new episodeaired check in 15 minutes.
      },

      autoDownload: function(serie, episode) {
        var hasCustomSeeders = (serie.customSeeders && serie.customSeeders != null) ? 1 : 0
        var hasCustomIncludes = (serie.customIncludes && serie.customIncludes != null) ? 1 : 0
        var hasCustomExcludes = (serie.customExcludes && serie.customExcludes != null) ? 1 : 0

        // Minimum amount of seeders required, default 50, overridden by customSeeders
        var minSeeders = (hasCustomSeeders) ? serie.customSeeders : SettingsService.get('torrenting.min_seeders')
        // Preferred Quality to append to search string.
        var preferredQuality = (serie.ignoreGlobalQuality != 0) ? '' : SettingsService.get('torrenting.searchquality')

        // Any words in the Ignore Keywords list causes the result to be filtered out.
        var ignoreKeywords = (hasCustomExcludes) ? serie.customExcludes + ' ' + SettingsService.get('torrenting.ignore_keywords') : SettingsService.get('torrenting.ignore_keywords')
        // series custom settings specify to ignore the Global Ignore Keywords List
        if (serie.ignoreGlobalExcludes != 0) ignoreKeywords = (hasCustomExcludes) ? serie.customExcludes : ''

        // Any words in the Require Keywords list causes the result to be filtered in.
        var requireKeywords = (hasCustomIncludes) ? serie.customIncludes + ' ' + SettingsService.get('torrenting.require_keywords') : SettingsService.get('torrenting.require_keywords')
        // series custom settings specify to ignore the Global Require Keywords List
        if (serie.ignoreGlobalIncludes != 0) requireKeywords = (hasCustomIncludes) ? serie.customIncludes : ''

        // torrents smaller than this are filtered out
        var globalSizeMin = SettingsService.get('torrenting.global_size_min')
        // torrents larger than this are filtered out
        var globalSizeMax = SettingsService.get('torrenting.global_size_max')
        // series custom search engine specified or default SE
        var searchEngine = (serie.searchProvider != null) ? TorrentSearchEngines.getSearchEngine(serie.searchProvider) : TorrentSearchEngines.getDefaultEngine()
        var label = (SettingsService.get('torrenting.label')) ? serie.name : null

        // set the Require Keywords mode (true=Any or false=All)
        var requireKeywordsModeOR = SettingsService.get('torrenting.require_keywords_mode_or')
        // used to add to query when Require Keywords mode is set to ALL
        var RequireKeywords_String = (requireKeywordsModeOR) ? '' : requireKeywords

        // Fetch the Scene Name for the series and compile the search string for the episode with the quality requirement.
        return SceneNameResolver.getSearchStringForEpisode(serie, episode).then(function(searchString) {
          var q = [searchString, preferredQuality, RequireKeywords_String].join(' ').trim()
          /**
           * Word-by-word scoring for search results.
           * All words need to be in the search result's release name, or the result will be filtered out.
           */
          function filterByScore(item) {
            var score = 0
            var query = q.toLowerCase().split(' ')
            var name = item.releasename.toLowerCase()
            query.map(function(part) {
              if (name.indexOf(part) > -1) {
                score++
              }
            })
            return (score === query.length)
          }

          /**
           * Any words in the Require Keywords list causes the result to be filtered in.
           */
          function filterRequireKeywords(item) {
            if (requireKeywords === '') return true

            var score = 0
            var query = requireKeywords.toLowerCase().split(' ')
            var name = item.releasename.toLowerCase()
            query.map(function(part) {
              if (name.indexOf(part) > -1) {
                score++
              }
            })

            return (score > 0)
          }

          /**
           * Any words in the ignore keyword list causes the result to be filtered out.
           */
          function filterIgnoreKeywords(item) {
            if (ignoreKeywords === '') return true

            var score = 0
            var query = ignoreKeywords.toLowerCase().split(' ')
            // prevent the exclude list from overriding the primary search string
            query = query.filter(function(el) {
              return q.indexOf(el) == -1
            })

            var name = item.releasename.toLowerCase()
            query.map(function(part) {
              if (name.indexOf(part) > -1) {
                score++
              }
            })

            return (score === 0)
          }

          /**
           * Torrent sizes outside min-max range causes the result to be filtered out.
           */
          function filterBySize(item) {
            if (item.size == null || item.size === 'n/a') {
              // if item size not available then accept item
              return true
            }

            var size = item.size.split(/\s{1}/)[0] // size split into value and unit
            // serie custom Search Size is available for override
            var sizeMin = (serie.customSearchSizeMin !== null) ? serie.customSearchSizeMin : globalSizeMin
            var sizeMax = (serie.customSearchSizeMax !== null) ? serie.customSearchSizeMax : globalSizeMax
            // set up accepted size range
            sizeMin = (sizeMin == null) ? 0 : sizeMin
            sizeMax = (sizeMax == null) ? Number.MAX_SAFE_INTEGER : sizeMax
            return (size >= sizeMin && size <= sizeMax)
          }

          /**
           * Search torrent SE for the torrent query
           */
          return searchEngine.search(q, true).then(function(results) {
            var items = $filter('orderBy')(results, '-seeders')
            items = items.filter(filterByScore)

            if (items.length === 0) {
              service.activityUpdate(serie, episode, q, 4) // 'nothing found'
              return // no results, abort
            }

            if (requireKeywordsModeOR) {
              items = items.filter(filterRequireKeywords)
              if (items.length === 0) {
                service.activityUpdate(serie, episode, q, 5, ' RK') // 'filtered out RK'
                return // no results, abort
              }
            }

            items = items.filter(filterIgnoreKeywords)
            if (items.length === 0) {
              service.activityUpdate(serie, episode, q, 5, ' IK') // 'filtered out IK'
              return // no results, abort
            }

            items = items.filter(filterBySize)
            if (items.length === 0) {
              service.activityUpdate(serie, episode, q, 5, ' MS') // 'filtered out MS'
              return // no results, abort
            }

            if (items[0].seeders != 'n/a' && parseInt(items[0].seeders, 10) < minSeeders) { // not enough seeders are available.
              service.activityUpdate(serie, episode, q, 7, items[0].seeders + ' < ' + minSeeders) // 'seeders x < y'
              return // no results, abort
            }

            DuckieTorrent.getClient().AutoConnect().then(function() {
              var torrentHash = null
              var debugNotify = function(notificationId) { if (window.debug982) console.debug('ADS notify id', notificationId) }

              NotificationService.notify(
                [serie.name, episode.getFormattedEpisode()].join(' '),
                [items[0].releasename, 'Download started on', DuckieTorrent.getClient().getName()].join(' ')
              )

              if (items[0].magnetUrl) {
                torrentHash = items[0].magnetUrl.getInfoHash()
                TorrentSearchEngines.launchMagnet(items[0].magnetUrl, episode.TRAKT_ID, serie.dlPath, label)
                episode.magnetHash = torrentHash
                episode.Persist().then(function() {
                  if (window.debug982) console.debug('ADS (search=magnet): episode download started ID_Episode(%s), ID_Serie(%s), episodename(%s), episodenumber(%s), seasonnumber(%s), watched(%s), watchedAt(%s), downloaded(%s), torrentHash(%s)', episode.ID_Episode, episode.ID_Serie, episode.episodename, episode.episodenumber, episode.seasonnumber, episode.watched, episode.watchedAt, episode.downloaded, episode.magnetHash)
                })
              } else if (items[0].torrentUrl) {
                window.parseTorrent.remote(items[0].torrentUrl, function(err, torrentDecoded) {
                  if (err) {
                    throw err
                  }
                  torrentHash = torrentDecoded.infoHash.getInfoHash()
                  $injector.get('$http').get(items[0].torrentUrl, {
                    responseType: 'blob'
                  }).then(function(result) {
                    try {
                      TorrentSearchEngines.launchTorrentByUpload(result.data, torrentHash, episode.TRAKT_ID, items[0].releasename, serie.dlPath, label)
                    } catch (E) {
                      TorrentSearchEngines.launchTorrentByURL(items[0].torrentUrl, torrentHash, episode.TRAKT_ID, items[0].releasename, serie.dlPath, label)
                    }
                    episode.magnetHash = torrentHash
                    episode.Persist().then(function() {
                      if (window.debug982) console.debug('ADS (search=url/upload): episode download started ID_Episode(%s), ID_Serie(%s), episodename(%s), episodenumber(%s), seasonnumber(%s), watched(%s), watchedAt(%s), downloaded(%s), torrentHash(%s)', episode.ID_Episode, episode.ID_Serie, episode.episodename, episode.episodenumber, episode.seasonnumber, episode.watched, episode.watchedAt, episode.downloaded, episode.magnetHash)
                    })
                  })
                })
              } else {
                searchEngine.getDetails(items[0].detailUrl, items[0].releasename).then(function(details) {
                  if (details.magnetUrl) {
                    torrentHash = details.magnetUrl.getInfoHash()
                    TorrentSearchEngines.launchMagnet(details.magnetUrl, episode.TRAKT_ID, serie.dlPath, label)
                    episode.magnetHash = torrentHash
                    episode.Persist().then(function() {
                      if (window.debug982) console.debug('ADS (details=magnet): episode download started ID_Episode(%s), ID_Serie(%s), episodename(%s), episodenumber(%s), seasonnumber(%s), watched(%s), watchedAt(%s), downloaded(%s), torrentHash(%s)', episode.ID_Episode, episode.ID_Serie, episode.episodename, episode.episodenumber, episode.seasonnumber, episode.watched, episode.watchedAt, episode.downloaded, episode.magnetHash)
                    })
                  } else if (details.torrentUrl) {
                    window.parseTorrent.remote(details.torrentUrl, function(err, torrentDecoded) {
                      if (err) {
                        throw err
                      }
                      torrentHash = torrentDecoded.infoHash.getInfoHash()
                      $injector.get('$http').get(details.torrentUrl, {
                        responseType: 'blob'
                      }).then(function(result) {
                        try {
                          TorrentSearchEngines.launchTorrentByUpload(result.data, torrentHash, episode.TRAKT_ID, items[0].releasename, serie.dlPath, label)
                        } catch (E) {
                          TorrentSearchEngines.launchTorrentByURL(details.torrentUrl, torrentHash, episode.TRAKT_ID, items[0].releasename, serie.dlPath, label)
                        }
                        episode.magnetHash = torrentHash
                        episode.Persist().then(function() {
                          if (window.debug982) console.debug('ADS (details=url/upload): episode download started ID_Episode(%s), ID_Serie(%s), episodename(%s), episodenumber(%s), seasonnumber(%s), watched(%s), watchedAt(%s), downloaded(%s), torrentHash(%s)', episode.ID_Episode, episode.ID_Serie, episode.episodename, episode.episodenumber, episode.seasonnumber, episode.watched, episode.watchedAt, episode.downloaded, episode.magnetHash)
                        })
                      })
                    })
                  }
                })
              }
              service.activityUpdate(serie, episode, q, 6) // 'torrent launched'
            })
          })
        })
      },

      attach: function() {
        if (!service.checkTimeout) {
          service.checkTimeout = setTimeout(service.autoDownloadCheck, 5000)
          $rootScope.$on('torrentclient:connected', function(remote) {
            console.info('Caught TorrentClient connected event! starting AutoDownload check!')
            service.autoDownloadCheck()
          })
        }
      },

      detach: function() {
        clearTimeout(service.checkTimeout)
        service.checkTimeout = null
      }
    }
    return service
  }
])

/**
 * Attach auto-download check interval when enabled.
 */
DuckieTV.run(['AutoDownloadService', 'SettingsService',
  function(AutoDownloadService, SettingsService) {
    if (SettingsService.get('torrenting.enabled') === true && SettingsService.get('torrenting.autodownload') === true) {
      var timeoutDelay = 5000 // optional customisation for #1062
      if (localStorage.getItem('custom_AutoDownload_delay')) {
        timeoutDelay = localStorage.getItem('custom_AutoDownload_delay')
      }

      setTimeout(function() {
        console.info('Initializing AutoDownload Service!')
        AutoDownloadService.attach()
      }, timeoutDelay)
    }
  }
])
;
/**
 * Episode watched monitor
 * Count all episodes watched for a season when changes occur, flip switches accordingly.
 */
DuckieTV.factory('watchedCounter', ['$q', 'FavoritesService', function($q, FavoritesService) {
  var queue = {

  }
  var queueTimer = null

  /**
     * Parse the episodes count returned from the recountSerie function into an object with season keys.
     * format:
     * {
     *   seasonID : { watched: <int>, notWatched: int },
     *   [...]
     * }
     * @return Object with season watched episode counts
     */
  function parseEpisodeCounts(counts) {
    var seasons = {}

    counts.rows.map(function(row) {
      if (!(row.ID_Season in seasons)) {
        seasons[row.ID_Season] = {
          watched: 0,
          notWatched: 0
        }
      }
      seasons[row.ID_Season][row.watched === 0 ? 'notWatched' : 'watched'] = row.amount
    })

    return seasons
  }

  /**
   * Iterate the output from parseEpisodeCounts
   * and mark every season as either watched or not watched based if notWatched = 0 (indicating that all episodes are watched)
   * Persist new season watched statuses, and return an intermediate array with boolean values that have a true/false for
   * every serie. reduce the boolean array into a single digit representing watched seasons for serie.
   * Return boolean that tells if number of seasons in the show matches watched season count.
   *
   * @return {boolean allSeasonsWatched, integer notWatchedTotal}
   */
  function markSeasonsWatched(seasons) {
    var notWatchedTotal = 0 // sum of all serie's seasons' notWatched episodes
    return $q.all(Object.keys(seasons).map(function(season) {
      return CRUD.FindOne('Season', {
        ID_Season: season
      }).then(function(s) {
        s.watched = seasons[season].notWatched === 0 ? 1 : 0
        s.notWatchedCount = seasons[season].notWatched
        notWatchedTotal = notWatchedTotal + seasons[season].notWatched
        // console.debug("Season watched? ", season, s.watched === 1);
        s.Persist()
        return s.watched === 1
      })
    })).then(function(result) {
      var watchedSeasonCount = result.reduce(function(prev, current) {
        return prev + (current === true ? 1 : 0)
      }, 0)
      var allSeasonsWatched = Object.keys(seasons).length == watchedSeasonCount
      return {
        'allSeasonsWatched': allSeasonsWatched,
        'notWatchedTotal': notWatchedTotal
      }
    })
  }

  /**
   * Fetch serie from favoritesservice for performance and toggle watched flag.
   */
  function markSerieWatched(ID_Serie, data) {
    var serie = FavoritesService.getByID_Serie(ID_Serie)
    // console.debug("Serie watched? ", serie.name, serie.watched, data.allSeasonsWatched, data.notWatchedTotal);
    serie.watched = data.allSeasonsWatched === false ? 0 : 1
    serie.notWatchedCount = data.notWatchedTotal
    serie.Persist()
  }

  /**
   * When all database queries are done, process a serie.
   * If not, delay processing for 50ms.
   */
  function processQueue() {
    if (CRUD.stats.writesExecuted == CRUD.stats.writesQueued) {
      if (Object.keys(queue).length > 0) {
        var ID_Serie = Object.keys(queue)[0]
        if (ID_Serie !== undefined) {
          delete queue[ID_Serie]
          processSerie(ID_Serie)
        }
      }
    }
    if (queueTimer !== null) {
      clearTimeout(queueTimer)
      queueTimer = null
    }
    if (Object.keys(queue).length > 0) {
      setTimeout(processQueue, 50)
    }
  }

  function processSerie(ID_Serie) {
    // console.debug("Re counting! ", ID_Serie);
    var query = 'select ID_Season, watched, count(watched) as amount from Episodes where ID_Serie = ? AND seasonnumber > 0 AND firstaired <= ? AND firstaired_iso NOT null GROUP BY ID_Season, watched'
    CRUD.executeQuery(query, [ID_Serie, new Date().getTime()])
      .then(parseEpisodeCounts)
      .then(markSeasonsWatched)
      .then(function(result) {
        markSerieWatched(ID_Serie, result)
      })
  }

  return {
    recountSerie: function(ID_Serie) {
      if (!(ID_Serie in queue)) {
        queue[ID_Serie] = true
      }
      processQueue()
    }
  }
}])

DuckieTV.run(['$rootScope', 'FavoritesService', 'watchedCounter', function($rootScope, FavoritesService, watchedCounter) {
  /**
     * Catch the event when an episode is marked as watched
     */
  $rootScope.$on('episode:marked:watched', function(evt, episode) {
    watchedCounter.recountSerie(episode.ID_Serie)
  })
  /**
     * Catch the event when an episode is marked as NOT watched
     */
  $rootScope.$on('episode:marked:notwatched', function(evt, episode) {
    watchedCounter.recountSerie(episode.ID_Serie)
  })
  /**
     * Catch serie update events
     */
  $rootScope.$on('serie:recount:watched', function(evt, serieID) {
    watchedCounter.recountSerie(serieID)
  })

  /**
     * Catch global recount event (for migrations 'n stuff )
     */
  $rootScope.$on('series:recount:watched', function() {
    angular.forEach(FavoritesService.favorites, function(serie) {
      watchedCounter.recountSerie(serie.ID_Serie)
    })
  })
}])
;
/**
 * Persistent storage for favorite series and episode
 *
 * Provides functionality to add and remove series and is the glue between Trakt.TV,
 */
DuckieTV.factory('FavoritesService', ['$q', '$rootScope', 'FanartService', 'SceneNameResolver', '$injector',
  function($q, $rootScope, FanartService, SceneNameResolver, $injector) {
    /**
     * Helper function to add a serie to the service.favorites hash if it doesn't already exist.
     * update existing otherwise.
     */
    var addToFavoritesList = function(serie) {
      var existing = service.favorites.filter(function(el) {
        return el.TRAKT_ID == serie.TRAKT_ID
      })
      if (existing.length === 0) {
        service.favorites.push(serie)
      } else {
        service.favorites[service.favorites.indexOf(existing[0])] = serie
      }
      service.favoriteIDs.push(serie.TRAKT_ID.toString())
    }

    /**
     * Helper function to map properties from the input data on a serie from Trakt.TV into a Serie CRUD object.
     * Input information will always overwrite existing information.
     * @param {Serie} serie the serie to update
     * @param {Object} data from trakt
     * @param {TMDBFanart} fanart
     */
    var fillSerie = function(serie, data, fanart) {
      data.TRAKT_ID = data.trakt_id
      data.TVDB_ID = data.tvdb_id
      data.TMDB_ID = data.tmdb_id
      data.TVRage_ID = data.tvrage_id
      data.IMDB_ID = data.imdb_id
      data.contentrating = data.certification
      data.name = data.title
      data.airs_dayofweek = data.airs.day
      data.airs_time = data.airs.time
      data.timezone = data.airs.timezone
      data.firstaired = new Date(data.first_aired).getTime()
      if (service.downloadRatings && (!serie.ratingcount || serie.ratingcount + 25 > data.votes)) {
        data.rating = Math.round(data.rating * 10)
        data.ratingcount = data.votes
      } else {
        delete data.rating
        delete data.ratingcount
      }
      data.genre = data.genres.join('|')
      data.lastupdated = data.updated_at
      if (data.people && 'cast' in data.people) {
        data.actors = data.people.cast.map(function(actor) {
          if ('character' in actor && actor.character != '') {
            return actor.person.name + ' (' + actor.character + ')'
          } else {
            return actor.person.name
          }
        }).join('|')
      }
      if (serie.added == null) {
        data.added = new Date().getTime()
      }
      for (var i in data) {
        if ((i in serie)) {
          // if (serie[i] !== data[i]) console.debug('serie ' + i + '=[' + data[i] + ']')
          serie[i] = data[i]
        }
      }

      if (fanart) {
        serie.fanart = fanart.fanart
        serie.poster = fanart.poster
      }
    }
    /**
     * Helper function to map properties from the input data from Trakt.TV into a Episode CRUD object.
     * Input information will always overwrite existing information.
     */
    function fillEpisode(episode, data, season, serie, watched, sceneStillImage) {
      // remap some properties on the data object to make them easy to set with a for loop. the CRUD object doesn't persist properties that are not registered, so that's cheap.
      data.TVDB_ID = data.tvdb_id
      data.TMDB_ID = data.tmdb_id
      data.IMDB_ID = data.imdb_id
      data.TRAKT_ID = data.trakt_id
      if (service.downloadRatings && (!episode.ratingcount || episode.ratingcount + 25 > data.votes)) {
        data.rating = Math.round(data.rating * 10)
        data.ratingcount = data.votes
      } else {
        delete data.rating
        delete data.ratingcount
      }
      data.episodenumber = data.number
      data.episodename = (data.title == null) ? 'TBA' : data.title
      data.firstaired = new Date(data.first_aired).getTime()
      data.firstaired_iso = data.first_aired
      if (!episode.isLeaked() && (data.firstaired === 0 || data.firstaired > new Date().getTime())) {
        // if the episode has not yet aired, make sure the download and watched status are zeroed. #491
        // unless leaked
        data.downloaded = 0
        data.watched = 0
        data.watchedAt = null
      }
      data.absolute = (serie.isAnime()) ? data.number_abs : null

      episode.filename = sceneStillImage
      episode.seasonnumber = season.seasonnumber
      for (var i in data) {
        if ((i in episode)) {
          // if (episode[i] !== data[i]) console.debug('episode S' + episode.seasonnumber + 'E' + data.episodenumber  + ' ' + i + '=[' + data[i] + ']')
          episode[i] = data[i]
        }
      }
      // if there's an entry for the episode in watchedEpisodes, this is a backup restore
      watched.map(function(el) {
        // Dtv.Backups upto 1.1.5 use TVDB_ID, after 1.1.5 use TRAKT_ID
        if (('TVDB_ID' in el && el.TVDB_ID && el.TVDB_ID == episode.TVDB_ID) || ('TRAKT_ID' in el && el.TRAKT_ID && el.TRAKT_ID == episode.TRAKT_ID)) {
          episode.downloaded = 1 // an entry means it has to have been downloaded
          episode.watchedAt = el.watchedAt // an entry may mean it's watched ... or not.
          if (el.watchedAt != null) {
            episode.watched = 1
          } else {
            episode.watched = 0
          }
        }
      })
      episode.ID_Serie = serie.getID()
      episode.ID_Season = season.getID()
      return episode
    }

    /**
     * Wipe episodes from the database that were cached locally but are no longer in the latest update.
     * @param object seasons Trakt.TV seasons/episodes input
     * @param object series serie entity
     */
    var cleanupEpisodes = function(seasons, serie) {
      var traktList = []
      seasons.map(function(season) {
        season.episodes.map(function(episode) {
          if (isNaN(parseInt(episode.trakt_id))) return
          traktList.push(episode.trakt_id)
        })
      })

      return CRUD.executeQuery('delete from Episodes where ID_Serie = ? and TRAKT_ID NOT IN (' + traktList.join(',') + ')', [serie.ID_Serie]).then(function(result) {
        if (result.rowsAffected > 0) {
          console.info('Cleaned up ' + result.rowsAffected + ' orphaned episodes for series [' + serie.ID_Serie + '] ' + serie.name)
        }
        return seasons
      })
    }

    /**
     * Insert all seasons into the database and return a cached array map
     * @param  CRUD.Entity serie serie to update seasons for
     * @param  object seasons extended seasons input data from Trakt
     * @return object seasonCache indexed by seasonnumber
     */
    async function updateSeasons(serie, seasons) {
      // console.debug("Update seasons!", seasons, fanart);
      const seasonCache = await serie.getSeasonsByNumber()

      await Promise.all(seasons.map(async season => {
        const SE = (season.number in seasonCache) ? seasonCache[season.number] : new Season()
        SE.poster = await FanartService.getSeasonPoster(season.tmdb_id)
        SE.seasonnumber = season.number
        SE.ID_Serie = serie.getID()
        SE.overview = season.overview
        SE.TRAKT_ID = season.trakt_id
        SE.TMDB_ID = season.tmdb_id
        if (service.downloadRatings && (!SE.ratingcount || SE.ratingcount + 25 > season.votes)) {
          SE.ratings = Math.round(season.rating * 10)
          SE.ratingcount = season.votes
        }
        seasonCache[season.number] = SE
        await SE.Persist()
      }))

      return seasonCache
    }

    /**
     * Insert all episodes into the database and return a cached array map
     * @param {Serie|any} serie
     * @param seasons
     * @param watched
     * @param {Record<number, Season>} seasonCache
     * @return {Promise<*>}
     */
    async function updateEpisodes(serie, seasons, watched, seasonCache) {
      const episodeCache = await serie.getEpisodesMap()

      await Promise.all(seasons.map(async season => {
        const episodeImages = await FanartService.getEpisodeImagesForSeason(serie.TMDB_ID, season.number)
        return Promise.all(season.episodes.map(async episode => {
          const dbEpisode = (!(episode.trakt_id in episodeCache)) ? new Episode() : episodeCache[episode.trakt_id]
          fillEpisode(dbEpisode, episode, seasonCache[season.number], serie, watched, episodeImages[episode.tmdb_id])
          await dbEpisode.Persist()
          episodeCache[episode.trakt_id] = dbEpisode
        }))
      }))

      return episodeCache
    }

    var service = {
      initialized: false,
      addingList: {}, // holds any TRAKT_ID's that are adding, used for spinner/checkmark icon control
      errorList: {}, // holds any TRAKT_ID's that had an error, used for sadface icon control
      favorites: [],
      favoriteIDs: [],
      downloadRatings: $injector.get('SettingsService').get('download.ratings'), // determines if Ratings are processed or discarded

      /**
       * Handles adding, deleting and updating a show to the local database.
       * Grabs the existing serie, seasons and episode from the database if they exist
       * and inserts or updates the information.
       * Deletes the episode from the database if TraktTV no longer has it.
       * Returns a promise that gets resolved when all the updates have been launched
       * (but not necessarily finished, they'll continue to run)
       *
       * @param object data input data from TraktTV or restore-from-backup
       * @param object watched { TRAKT_ID => watched episodes } mapped object to auto-mark as watched
       */
      addFavorite: async function(data, watched, useTrakt_id, updateImages) {
        watched = watched || []
        useTrakt_id = useTrakt_id || false

        if (data.title === null) { // if odd invalid data comes back from trakt.tv, remove the whole serie from db.
          console.error('received error data as input, removing from favorites.')
          return service.remove({
            name: data.title,
            TRAKT_ID: data.trakt_id
          })
        }

        const serie = (useTrakt_id) ? service.getByTRAKT_ID(data.trakt_id) || new Serie() : service.getByTVDB_ID(data.tvdb_id) || new Serie()

        const showFanart = await FanartService.getShowImages(data, updateImages)
        fillSerie(serie, data, showFanart)
        await serie.Persist()

        addToFavoritesList(serie) // cache serie in favoritesservice.favorites
        $rootScope.$applyAsync()
        await cleanupEpisodes(data.seasons, serie)
        const seasonCache = await updateSeasons(serie, data.seasons)
        const episodeCache = await updateEpisodes(serie, data.seasons, watched, seasonCache)

        $injector.get('CalendarEvents').processEpisodes(serie, episodeCache)
        // console.debug("FavoritesService.Favorites", service.favorites)
        $rootScope.$applyAsync()
        $rootScope.$broadcast('background:load', serie.fanart)
        $rootScope.$broadcast('storage:update')
        $rootScope.$broadcast('serie:recount:watched', serie.ID_Serie)

        return serie
      },
      waitForInitialization: function() {
        return $q(function(resolve) {
          function waitForInitialize() {
            if (service.initialized) {
              resolve()
            } else {
              setTimeout(waitForInitialize, 50)
            }
          }
          waitForInitialize()
        })
      },
      getEpisodesForDateRange: function(start, end) {
        return service.waitForInitialization().then(function() {
          var filter = ['Episodes.firstaired >= "' + start + '" AND Episodes.firstaired <= "' + end + '" ']
          return CRUD.Find('Episode', filter).then(function(ret) {
            return ret
          })
        })
      },
      getByTVDB_ID: function(id) {
        return service.favorites.filter(function(el) {
          return el.TVDB_ID == id
        })[0]
      },
      getByTRAKT_ID: function(id) {
        return service.favorites.filter(function(el) {
          return el.TRAKT_ID == id
        })[0]
      },
      getByID_Serie: function(id) {
        return service.favorites.filter(function(el) {
          return el.ID_Serie == id
        })[0]
      },
      hasFavorite: function(id) {
        return service.favoriteIDs.indexOf(id.toString()) > -1
      },
      /**
       * Remove a serie, it's seasons, and it's episodes from the database.
       */
      remove: function(serie) {
        serie.displaycalendar = 0
        console.info('Remove serie from favorites!', serie)

        CRUD.executeQuery('delete from Seasons where ID_Serie = ' + serie.ID_Serie)
        CRUD.executeQuery('delete from Episodes where ID_Serie = ' + serie.ID_Serie)

        service.favoriteIDs = service.favoriteIDs.filter(function(id) {
          return id != serie.TRAKT_ID
        })

        if ('Delete' in serie) {
          serie.Delete().then(function() {
            service.favorites = service.favorites.filter(function(el) {
              return el.getID() != serie.getID()
            })

            console.info("Serie '" + serie.name + "' deleted. Syncing storage.")
            $rootScope.$broadcast('storage:update')

            if (service.favorites.length === 0) {
              $rootScope.$broadcast('serieslist:empty')
            }
          })
        }
        service.clearAdding(serie.TRAKT_ID)
      },
      refresh: function() {
        return service.getSeries().then(function(results) {
          service.favorites = results
          var ids = []

          results.map(function(el) {
            ids.push(el.TRAKT_ID.toString())
          })

          service.favoriteIDs = ids
          if (ids.length === 0) {
            setTimeout(function() {
              $rootScope.$broadcast('serieslist:empty')
            }, 0)
          }
          return service.favorites
        })
      },
      /**
       * Fetch all the series asynchronously and return them as POJO's
       * (Plain Old Javascript Objects)
       * Runs automatically when this factory is instantiated
       */
      getSeries: function() {
        return CRUD.Find('Serie', ['name is not NULL']).then(function(results) {
          results.map(function(el, idx) {
            results[idx] = el
          })
          return results
        })
      },
      /**
       * Load a random background from the shows database
       * The BackgroundRotator service is listening for this event
       */
      loadRandomBackground: function() {
        // dafuq. no RANDOM() in sqlite in chrome...
        // then we pick a random array item from the resultset based on the amount.
        CRUD.executeQuery("select fanart from Series where fanart != ''").then(function(result) {
          if (result.rows.length > 0) {
            $rootScope.$broadcast('background:load', result.rows[Math.floor(Math.random() * (result.rows.length - 1))].fanart)
          }
        })
      },
      /**
       * set true the adding status for this series. used to indicate spinner icon required
       */
      adding: function(trakt_id) {
        if (!(trakt_id in service.addingList)) {
          service.addingList[trakt_id] = true
          service.clearError(trakt_id)
        }
      },
      /**
       * set false the adding status for this series. used to indicate checkmark icon required
       */
      added: function(trakt_id) {
        if (trakt_id in service.addingList) service.addingList[trakt_id] = false
      },
      /**
       * flush the adding and error status list
       */
      flushAdding: function() {
        service.addingList = {}
        service.errorList = {}
      },
      /**
       * Returns true as long as the add a show to favorites promise is running.
       */
      isAdding: function(trakt_id) {
        if (trakt_id === null) return false
        return ((trakt_id in service.addingList) && (service.addingList[trakt_id] === true))
      },
      /**
       * Used to show checkmarks in the add modes for series that you already have.
       */
      isAdded: function(trakt_id) {
        if (trakt_id === null) return false
        return service.hasFavorite(trakt_id.toString())
      },
      /**
       * clear the adding status for this series. used to indicate spinner and checkmark are NOT required.
       */
      clearAdding: function(trakt_id) {
        if ((trakt_id in service.addingList)) delete service.addingList[trakt_id]
      },
      /**
       * add the error status for this series. used to indicate sadface icon is required.
       */
      addError: function(trakt_id, error) {
        service.errorList[trakt_id] = error
      },
      /**
       * Used to show sadface icon in the add modes for series that you already have.
       */
      isError: function(trakt_id) {
        if (trakt_id === null) return false
        return ((trakt_id in service.errorList))
      },
      /**
       * clear the error status for this series. used to indicate sadface icon is NOT required.
       */
      clearError: function(trakt_id) {
        if ((trakt_id in service.errorList)) delete service.errorList[trakt_id]
      }
    }

    return service
  }
])

DuckieTV.run(['FavoritesService', '$state', '$rootScope', function(FavoritesService, $state, $rootScope) {
  // console.log("Executing favoritesservice.run block");
  $rootScope.$on('serieslist:empty', function() {
    // console.log("Series list is empty!, going to add screen.");
    setTimeout(function() {
      $state.go('add_favorites')
    }, 500)
  })

  // console.log("Executing favoritesservice.refresh.");

  FavoritesService.refresh().then(function(favorites) {
    // console.log("Favoritesservice refreshed!");
    FavoritesService.loadRandomBackground()
    FavoritesService.initialized = true
  })
}])
;
/**
 * FavoritesManager
 * Has add / remove / refresh functions for trakt.tv shows
 * Deduplicates a lot of logic and duplicated dependency injections
 */
DuckieTV.factory('FavoritesManager', ['FavoritesService', 'TraktTVv2', '$rootScope', '$filter', 'dialogs', '$q',
  function(FavoritesService, TraktTVv2, $rootScope, $filter, dialogs, $q) {
    var service = {
      /**
       * Add a show to the database, show progress via FavoritesService.added / errors
       * @param object serie object from trakt
       * @param boolean refresh (optional)
       * @return Promise
       */
      add: function(serie, refresh) {
        refresh = refresh || false
        if (!FavoritesService.isAdding(serie.trakt_id) && (refresh || !FavoritesService.isAdded(serie.trakt_id))) {
          FavoritesService.adding(serie.trakt_id)
          var id = serie.trakt_id || serie.imdb_id || serie.slug_id
          return TraktTVv2.serie(id).then(function(serie) {
            return FavoritesService.addFavorite(serie, undefined, true, refresh).then(function() {
              $rootScope.$broadcast('storage:update')
              FavoritesService.added(serie.trakt_id)
              return true
            })
          }, function(err) {
            console.error('Error adding show!', err)
            FavoritesService.added(serie.trakt_id)
            FavoritesService.addError(serie.trakt_id, err)
            return false
          })
        } else {
          return $q.when(function() {
            return true
          })
        }
      },
      /**
       * Popup dialog to confirm removal and perform removal.
       */
      remove: function(serie) {
        var dlg = dialogs.confirm($filter('translate')('COMMON/serie-delete/hdr'),
          $filter('translate')('COMMON/serie-delete-question/desc') +
                  serie.name +
                  $filter('translate')('COMMON/serie-delete-question/desc2')
        )

        return dlg.result.then(function() {
          console.info("Removing serie '" + serie.name + "' from favorites!")
          return FavoritesService.remove(serie)
        }, function() {})
      },
      /**
       * Refresh a show by passing a TRAKT_ID
       * Resolves the basic serie info from trakt and re-adds it, overriding the not-added check.
       */
      refresh: function(TRAKT_ID) {
        return TraktTVv2.resolveID(TRAKT_ID, true).then(function(serie) {
          return service.add(serie, true)
        })
      },

      isAdding: function(trakt_id) {
        return FavoritesService.isAdding(trakt_id)
      },

      getByTrakt_id: function(id) {
        return FavoritesService.getByTRAKT_ID(id)
      }

    }

    return service
  }])
;
/**
 * FileReader Provider and directive
 * Allows to read the contents of a file upload field to string
 */
DuckieTV.factory('FileReader', ['$q',
  function($q) {
    // Fires when the while file blob has been read
    var onLoad = function(reader, deferred, $scope) {
      return function() {
        $scope.$apply(function() {
          deferred.resolve(reader.result)
        })
      }
    }
    // Fires when an error has occured during the reading of a file
    var onError = function(reader, deferred, $scope) {
      return function() {
        $scope.$apply(function() {
          deferred.reject(reader.result)
        })
      }
    }
    // Handle file reading progress.
    // Catching this with a $scope.$watch for fileProgress
    // is only really useful for showing a progresbar on large file reads
    var onProgress = function(reader, $scope) {
      return function(event) {
        $scope.$broadcast('fileProgress', {
          total: event.total,
          loaded: event.loaded
        })
      }
    }

    /**
     *  Create a new fileReader and hook an existing promise to it's event handlers
     */
    var getReader = function(deferred, $scope) {
      var reader = new FileReader()
      reader.onload = onLoad(reader, deferred, $scope)
      reader.onerror = onError(reader, deferred, $scope)
      reader.onprogress = onProgress(reader, $scope)
      return reader
    }

    /**
     * Read a file as text. Creates a FileReader instance and resolves a promise when
     * the file has been read.
     */
    var readAsText = function(file, $scope) {
      var deferred = $q.defer()
      var reader = getReader(deferred, $scope)
      reader.readAsText(file)
      return deferred.promise
    }

    // return only the public readAsText function
    return {
      readAsText: readAsText
    }
  }])

/**
 * The <file-input> directive provides a file upload box that
 * can read the contents of the file selected into a string.
 *
 * When a file is selected, it fires it's onChange event and can
 * then return the contents of the file via FileReader.readAsText(fileName)
 */
DuckieTV.directive('fileInput', ['$parse', function($parse) {
  return {
    restrict: 'EA',
    template: "<input type='file' />",
    replace: true,
    link: function(scope, element, attrs) {
      var modelGet = $parse(attrs.fileInput)
      var modelSet = modelGet.assign
      var onChange = $parse(attrs.onChange)

      var updateModel = function() {
        // console.debug("UPDATE!");
        scope.$apply(function() {
          modelSet(scope, element[0].files[0])
          onChange(scope)
        })
      }

      element.bind('change', updateModel)
    }
  }
}])
;
/**
 *
 * Angular-Formly file-loader companion module by SchizoDuckie
 *
 * Store your formly-forms in .json files and load them at runtime to keep your controller clean
 * Usage: <todo:link to jsbin here>
 *
 */
DuckieTV.factory('FormlyLoader', ['$http', '$parse', function($http, $parse) {
  var config = {
    basePath: 'templates/formly-forms/',
    mappings: {}
  }

  /**
   * Recursively process the formly form's fieldGroup, process individual formly elements when no fieldgroups found
   */
  function recursivePropertyMap(field) {
    if (field.fieldGroup) {
      field.fieldGroup = field.fieldGroup.map(recursivePropertyMap)
      return field
    }
    return processMappings(field)
  }

  /**
   * Recursively process the properties of the json file loaded.
   * Find properties that are strings and start with $mappings.
   * If this is a property registered with setMapping, it will grab the value of it via $parse
   * Example:
   *
   *
   *   {
   *      "key": "leecherProperty",
   *      "className": "cseProperty col-xs-3",
   *      "type": "select",
   *      "templateOptions": {
   *          "required": true,
   *          "label": "Attribute",
   *          "valueProp": "name",
   *          "options": "$mappings.options.attributeWhitelist"
   *      },
   *      "asyncValidators": "$mappings.validators.attributeSelector"
   *  }
   *
   */
  function processMappings(field) {
    Object.keys(field).map(function(key) {
      if (angular.isObject(field[key])) {
        field[key] = processMappings(field[key])
      } else if (field[key].toString().indexOf('$mappings') === 0) {
        var getter = $parse(field[key].split('$mappings.')[1])
        field[key] = getter(config.mappings)
      }
    })
    return field
  }

  var service = {
    /**
     * Configure base path to load forms from.
     * @param string path
     */
    setBasePath: function(path) {
      config.basePath = path
    },
    /**
     * Load a form from json and process the registered mappings.
     * @param string form name of the form to load (wrapped between basepath and  .json)
     * @returns Promise(form config)
     */
    load: function(form) {
      return $http.get(config.basePath + form + '.json').then(function(result) {
        return result.data.map(recursivePropertyMap)
      })
    },
    /**
     * Register a property and an object that you will target at any point in your formly json config to have them
     * automagically swapped out at load.
     * This prevents duplication in your forms (for for instance repeating properties and validators) and allows you
     * to map javascript functions while still storing your form as json.
     *
     * usage:
     *
     * // In your controller before FormlyLoader.load('myFormName')
     *
     * FormlyLoader.setMapping('modelOptions', {
     *   keyup: {
     *       "updateOn": "keyup",
     *       "debounce": 200
     *   }
     *  });
     *
     * // In your myFormName.json:
     *
     * {
     *   "className": "row",
     *   "fieldGroup": [{
     *       "key": "leecherSelector",
     *       "className": "cseSelector col-xs-6",
     *       "type": "input",
     *       "templateOptions": {
     *           "required": true,
     *           "label": "Leechers Selector (element that has the 'leechers')",
     *           "type": "text"
     *       },
     *       "asyncValidators": "$mappings.validators.propertySelector",
     *       "modelOptions": "$mappings.modelOptions.keyup"
     *  }
     *
     * @param string key mapping key to register
     * @param object mappings to register for the key
     *
     */
    setMapping: function(key, option) {
      config.mappings[key] = option
    }
  }

  return service
}])
;
/**
 * Fanart Service that handles getting artwork for shows, seasons and episodes and updating them
 */
DuckieTV.factory('FanartService', ['TMDBService', function(TMDBService) {
  const SHOW_ENTITY_TYPE = 1
  const SEASON_ENTITY_TYPE = 2

  async function StoreDataInDb(tmdbId, entityType, posterPath, fanartPath, screenshotPath) {
    const entity = await CRUD.FindOne('TMDBFanart', { entity_type: entityType, tmdb_id: tmdbId }) || new TMDBFanart()
    entity.entity_type = entityType
    entity.TMDB_ID = tmdbId
    entity.poster = TMDBService.getImageUrl(posterPath)
    entity.fanart = TMDBService.getImageUrl(fanartPath, 'original')
    entity.screenshot = TMDBService.getImageUrl(screenshotPath)
    entity.added = Date.now()
    await entity.Persist()
    return entity
  }

  const service = {
    /**
     * Returns images for a show via it's tmdb id from the tmdb fanart database
     * If images for the show haven't been fetched yet, then they will be fetched and stored in the database
     * This does not update any images stored on the Serie (if its in Favorites)
     * @param {object} serie - Serie object containing a tmdb_id
     * @param {boolean} forceUpdate - If true then the images will be fetched from TMDB and stored in the database regardless of whether they already exist
     * @returns {Promise<TMDBFanart | undefined>}
     */
    getShowImages: async function(serie, forceUpdate = false) {
      // hack to support a CRUD Serie or a TraktTV serie object from trending
      const tmdbId = serie.tmdb_id || serie.TMDB_ID
      if (!tmdbId) {
        return
      }

      /** @type {TMDBFanart} */
      let entity = await CRUD.FindOne('TMDBFanart', { entity_type: SHOW_ENTITY_TYPE, tmdb_id: tmdbId })

      // if we're force updating then only update if the entity is older than 4 minutes
      if (forceUpdate && entity && entity.added < Date.now() - 1000 * 60 * 4) {
        entity = null
      }

      if (!entity) {
        entity = await service.updateTmdbImagesForShow(tmdbId)
      }

      // if entity was added more than a month ago then fetch new images in the background
      if (entity && entity.added < Date.now() - 1000 * 60 * 60 * 24 * 28) {
        service.updateTmdbImagesForShow(tmdbId)
      }

      return entity
    },

    /**
     * Returns a poster for a season via it's tmdb id if it exists
     * Season posters are cached in the database when images for the show are fetched
     * If for some reason the show hasn't been fetched yet then no poster will be returned
     * @param {number} seasonTmdbId - The tmdb id of the season
     * @returns {Promise<string | undefined>}
     */
    getSeasonPoster: async function(seasonTmdbId) {
      const entity = await CRUD.FindOne('TMDBFanart', { entity_type: SEASON_ENTITY_TYPE, tmdb_id: seasonTmdbId })
      return entity?.poster
    },

    /**
     * Returns a mapping of episode tmdb ids to episode images for a season
     * To get a season on TMDB you need the show tmdb id and the season number
     * @param showTmdbId - The tmdb id of the show
     * @param seasonNumber - The season number
     * @return {Promise<{}>} - A mapping of episode tmdb ids to episode images
     */
    getEpisodeImagesForSeason: async function(showTmdbId, seasonNumber) {
      const episodeImageMap = {}

      if (!showTmdbId || !(seasonNumber >= 0)) {
        return episodeImageMap
      }

      const season = await TMDBService.getSeason(showTmdbId, seasonNumber)
      if (!season) {
        console.warn('FanartService.getEpisodeImagesFromSeason: got no data for show tmdb id', showTmdbId, 'and season number', seasonNumber)
        return episodeImageMap
      }

      for (const episode of season.episodes) {
        episodeImageMap[episode.id] = TMDBService.getImageUrl(episode.still_path)
      }

      return episodeImageMap
    },

    /**
     * Updates the show images for a serie from TMDB
     * This will also store any season posters for the show
     * @param {number} showTmdbId - The tmdb id of the show
     * @returns {Promise<TMDBFanart | undefined>}
     */
    updateTmdbImagesForShow: async function(showTmdbId) {
      if (!showTmdbId) {
        return
      }

      const showData = await TMDBService.getShow(showTmdbId)
      if (!showData) {
        console.warn('FanartService.updateShowImages: got no data from tmdb for tmdb id', showTmdbId)
      }

      const entity = await StoreDataInDb(showTmdbId, SHOW_ENTITY_TYPE, showData?.poster_path, showData?.backdrop_path, null)

      for (const season of showData?.seasons || []) {
        await StoreDataInDb(season.id, SEASON_ENTITY_TYPE, season.poster_path, null, null)
      }

      return entity
    }
  }

  return service
}])

/**
 * Fanart API v3 service
 * docs: http://docs.fanarttv.apiary.io/#
 */
// DuckieTV.factory('FanartTVService', ['$q', '$http', function($q, $http) {
//   var endpoint = 'https://webservice.fanart.tv/v3/tv/'
//   var API_KEY = 'mæ¶ën|{W´íïtßg½÷¾6mÍ9Õýß'
//
//   function getUrl(tvdb_id) {
//     return [endpoint, tvdb_id, '?api_key=', btoa(API_KEY)].join('')
//   }
//
//   function storeInDB(json, entity) {
//     var art = entity || new Fanart();
//     // remove unused art
//     ['characterart', 'seasonbanner', 'seasonthumb', 'clearart'].map(function(item) {
//       if (item in json) {
//         delete json[item]
//       }
//     })
//     art.TVDB_ID = json.thetvdb_id
//     art.json = json
//     art.poster = service.getTrendingPoster(json)
//     art.Persist()
//     return art
//   }
//
//   var service = {
//     get: function(tvdb_id, refresh) {
//       if (!tvdb_id) {
//         console.info('Could not load fanart for null tvdb_id')
//         return $q.resolve({}) // prevent http-not-found errors
//       }
//       refresh = refresh || false
//       return CRUD.FindOne('Fanart', { TVDB_ID: tvdb_id }).then(function(entity) {
//         if (entity && !refresh) {
//           return entity
//         } else {
//           return $http.get(getUrl(tvdb_id)).then(function(result) {
//             // console.debug('Refreshed fanart for tvdb_id=', tvdb_id);
//             return storeInDB(result.data, entity)
//           }, function(err) {
//             console.error('Could not load fanart for tvdb_id=', tvdb_id, err)
//             return false
//           })
//         }
//       }, function(err) {
//         console.error('Could not load fanart for tvdb_id=', tvdb_id, err)
//         return false
//       })
//     },
//     getTrendingPoster: function(fanart) {
//       // console.debug('fanart.getTrendingPoster', fanart);
//       if (!fanart) {
//         return null
//       }
//       // prefer english over others, and tvposter over clearlogo over hdtvlogo
//       var hdtvlogo
//       var clearlogo
//       var tvposter
//       if ('hdtvlogo' in fanart) {
//         hdtvlogo = fanart.hdtvlogo[0] // default
//         for (var i = 0; i < fanart.hdtvlogo.length; i++) {
//           if (fanart.hdtvlogo[i].lang == 'en') {
//             hdtvlogo = fanart.hdtvlogo[i]
//             break
//           }
//         }
//       }
//       if ('clearlogo' in fanart) {
//         clearlogo = fanart.clearlogo[0] // default
//         for (var i = 0; i < fanart.clearlogo.length; i++) {
//           if (fanart.clearlogo[i].lang == 'en') {
//             clearlogo = fanart.clearlogo[i]
//             break
//           }
//         }
//       }
//       if ('tvposter' in fanart) {
//         tvposter = fanart.tvposter[0] // default
//         for (var i = 0; i < fanart.tvposter.length; i++) {
//           if (fanart.tvposter[i].lang == 'en') {
//             tvposter = fanart.tvposter[i]
//             break
//           }
//         }
//       }
//       if (tvposter && tvposter.lang == 'en')
//         return tvposter.url.replace('/fanart', '/preview')
//       if (clearlogo && clearlogo.lang == 'en')
//         return clearlogo.url.replace('/fanart', '/preview')
//       if (hdtvlogo && hdtvlogo.lang == 'en')
//         return hdtvlogo.url.replace('/fanart', '/preview')
//       if (tvposter)
//         return tvposter.url.replace('/fanart', '/preview')
//       if (clearlogo)
//         return clearlogo.url.replace('/fanart', '/preview')
//       if (hdtvlogo)
//         return hdtvlogo.url.replace('/fanart', '/preview')
//       return null
//     },
//     getSeriesPoster: function(fanart) {
//       // console.debug('fanart.getSeriesPoster', fanart);
//       if (!fanart) {
//         return null
//       }
//       // prefer english over others, and tvposter over clearlogo over hdtvlogo
//       var hdtvlogo
//       var clearlogo
//       var tvposter
//       if ('hdtvlogo' in fanart) {
//         hdtvlogo = fanart.hdtvlogo[0] // default
//         for (var i = 0; i < fanart.hdtvlogo.length; i++) {
//           if (fanart.hdtvlogo[i].lang == 'en') {
//             hdtvlogo = fanart.hdtvlogo[i]
//             break
//           }
//         }
//       }
//       if ('clearlogo' in fanart) {
//         clearlogo = fanart.clearlogo[0] // default
//         for (var i = 0; i < fanart.clearlogo.length; i++) {
//           if (fanart.clearlogo[i].lang == 'en') {
//             clearlogo = fanart.clearlogo[i]
//             break
//           }
//         }
//       }
//       if ('tvposter' in fanart) {
//         tvposter = fanart.tvposter[0] // default
//         for (var i = 0; i < fanart.tvposter.length; i++) {
//           if (fanart.tvposter[i].lang == 'en') {
//             tvposter = fanart.tvposter[i]
//             break
//           }
//         }
//       }
//       if (tvposter && tvposter.lang == 'en')
//         return tvposter.url
//       if (clearlogo && clearlogo.lang == 'en')
//         return clearlogo.url
//       if (hdtvlogo && hdtvlogo.lang == 'en')
//         return hdtvlogo.url
//       if (tvposter)
//         return tvposter.url
//       if (clearlogo)
//         return clearlogo.url
//       if (hdtvlogo)
//         return hdtvlogo.url
//       return null
//     },
//     getSeriesBackground: function(fanart) {
//       // console.debug('fanart.getSeriesBackground', fanart);
//       if (!fanart) {
//         return null
//       }
//       // prefer english over others, and showbackground over hdclearart
//       var hdclearart
//       var showbackground
//       if ('hdclearart' in fanart) {
//         hdclearart = fanart.hdclearart[0] // default
//         for (var i = 0; i < fanart.hdclearart.length; i++) {
//           if (fanart.hdclearart[i].lang == 'en') {
//             hdclearart = fanart.hdclearart[i]
//             break
//           }
//         }
//       }
//       if ('showbackground' in fanart) {
//         showbackground = fanart.showbackground[0] // default
//         for (var i = 0; i < fanart.showbackground.length; i++) {
//           if (fanart.showbackground[i].lang == 'en') {
//             showbackground = fanart.showbackground[i]
//             break
//           }
//         }
//       }
//       if (showbackground && showbackground.lang == 'en')
//         return showbackground.url
//       if (hdclearart && hdclearart.lang == 'en')
//         return hdclearart.url
//       if (showbackground)
//         return showbackground.url
//       if (hdclearart)
//         return hdclearart.url
//       return null
//     },
//     getSeriesBanner: function(fanart) {
//       // console.debug('fanart.getSeriesBanner', fanart);
//       if (!fanart) {
//         return null
//       }
//       // prefer english over others
//       var tvbanner
//       if ('tvbanner' in fanart) {
//         tvbanner = fanart.tvbanner[0] // default
//         for (var i = 0; i < fanart.tvbanner.length; i++) {
//           if (fanart.tvbanner[i].lang == 'en') {
//             tvbanner = fanart.tvbanner[i]
//             break
//           }
//         }
//       }
//       if (tvbanner && tvbanner.lang == 'en')
//         return tvbanner.url
//       if (tvbanner)
//         return tvbanner.url
//       return null
//     },
//     getSeasonPoster: function(seasonnumber, fanart) {
//       // console.debug('fanart.getSeasonPoster', seasonnumber, fanart);
//       if (!fanart) {
//         return null
//       }
//       // prefer english over others, and seasonposter over tvposter
//       var seasonposter
//       var tvposter
//       if ('seasonposter' in fanart) {
//         var hit = fanart.seasonposter.filter(function(image) {
//           return parseInt(image.season) == parseInt(seasonnumber)
//         })
//         if (hit && hit.length > 0) {
//           seasonposter = hit[0] // default
//           for (var i = 0; i < hit.length; i++) {
//             if (hit[i].lang == 'en') {
//               seasonposter = hit[i]
//               break
//             }
//           }
//         }
//       }
//       if (('tvposter' in fanart)) {
//         tvposter = fanart.tvposter[0] // default
//         for (var i = 0; i < fanart.tvposter.length; i++) {
//           if (fanart.tvposter[i].lang == 'en') {
//             tvposter = fanart.tvposter[i]
//             break
//           }
//         }
//       }
//       if (seasonposter && seasonposter.lang == 'en')
//         return seasonposter.url
//       if (tvposter && tvposter.lang == 'en')
//         return tvposter.url
//       if (seasonposter)
//         return seasonposter.url
//       if (tvposter)
//         return tvposter.url
//       return null
//     },
//     getEpisodePoster: function(fanart) {
//       // console.debug('fanart.getEpisodePoster', fanart);
//       if (!fanart) {
//         return null
//       }
//       // prefer english over others, and tvthumb over hdtvlogo
//       var tvthumb
//       var hdtvlogo
//       if (('tvthumb' in fanart)) {
//         tvthumb = fanart.tvthumb[0] // default
//         for (var i = 0; i < fanart.tvthumb.length; i++) {
//           if (fanart.tvthumb[i].lang == 'en') {
//             tvthumb = fanart.tvthumb[i]
//             break
//           }
//         }
//       }
//       if ('hdtvlogo' in fanart) {
//         hdtvlogo = fanart.hdtvlogo[0] // default
//         for (var i = 0; i < fanart.hdtvlogo.length; i++) {
//           if (fanart.hdtvlogo[i].lang == 'en') {
//             hdtvlogo = fanart.hdtvlogo[i]
//             break
//           }
//         }
//       }
//       if (tvthumb && tvthumb.lang == 'en')
//         return tvthumb.url
//       if (hdtvlogo && hdtvlogo.lang == 'en')
//         return hdtvlogo.url
//       if (tvthumb)
//         return tvthumb.url
//       if (hdtvlogo)
//         return hdtvlogo.url
//       return null
//     },
//     /**
//      * To populate fanart.cache
//      */
//     store: function() {
//       var cache = {}
//       CRUD.Find('Fanart', {}, { 'limit': '0,99999' }).then(function(result) {
//         result.map(function(fanart) {
//           cache[fanart.TVDB_ID] = fanart.json
//         })
//         localStorage.setItem('fanart.cache', JSON.stringify(cache))
//       })
//     },
//     /**
//      * Populate fanart cache if there is none
//      */
//     initialize: function() {
//       if (localStorage.getItem('fanart.cache')) {
//         var cache = JSON.parse(localStorage.getItem('fanart.cache'))
//         Object.keys(cache).map(function(tvdb_id) {
//           storeInDB(cache[tvdb_id])
//         })
//         localStorage.removeItem('fanart.cache')
//       }
//       if (!localStorage.getItem('fanart.bootstrapped')) {
//         $http.get('fanart.cache.json').then(function(result) {
//           return Promise.all(Object.keys(result.data).map(function(tvdb_id) {
//             return storeInDB(result.data[tvdb_id])
//           }))
//         }).then(function() {
//           localStorage.setItem('fanart.bootstrapped', 1)
//         })
//       }
//     }
//   }
//   return service
// }
// ])
//
// DuckieTV.run(['FanartTVService', function(FanartTVService) {
//   FanartTVService.initialize()
// }])
;
/**
 * The notification service can create Chrome Notifications to notify users of aired episodes.
 */
DuckieTV.factory('NotificationService', ['SettingsService', function(SettingsService) {
  var ids = {} // track existing notifications

  /**
   * Create a Chrome Notification
   */
  var create = function(options, callback) {
    if ('chrome' in window && 'notifications' in window.chrome && 'create' in window.chrome.notifications && 'getPermissionLevel' in window.chrome.notifications) {
      if (!SettingsService.get('notifications.enabled')) {
        return
      }

      window.chrome.notifications.getPermissionLevel(function(level) {
        // User has elected not to show notifications from the app or extension.
        if (level.toLowerCase() === 'denied') {
          SettingsService.set('notifications.enabled', false)
          return
        }
      })
    } else {
      // notifications not supported
      if (SettingsService.get('notifications.enabled')) {
        SettingsService.set('notifications.enabled', false)
      }

      return
    }

    var id = 'seriesguide_' + new Date().getTime()
    ids[id] = options
    window.chrome.notifications.create(id, options, callback || function() {})
  }

  return {
    /**
     * Create a basic notification with the duckietv icon
     */
    notify: function(title, message, callback) {
      create({
        type: 'basic',
        title: title,
        message: message,
        iconUrl: 'img/logo/icon64.png'
      }, callback)
    },
    /**
     * Create a notification of the type 'list' with the DuckieTV icon
     */
    list: function(title, message, items, callback) {
      create({
        type: 'list',
        title: title,
        message: message,
        iconUrl: 'img/logo/icon64.png',
        items: items
      })
    }
  }
}])
;
/**
 * Service to fetch subtiles for an episode
 */
DuckieTV.factory('OpenSubtitles', ['xmlrpc', 'SettingsService',
  function(xmlrpc, SettingsService) {
    var self = this

    xmlrpc.config({
      hostName: 'https://api.opensubtitles.org', // Default is empty
      pathName: '/xml-rpc', // Default is /rpc2
      401: function() {
        console.warn('You shall not pass !')
      },
      404: function() {
        console.info('Subtitle not found')
      },
      500: function() {
        console.error('Something went wrong :(')
      }
    })

    var parseSubtitles = function(data, query) {
      var output = []

      if (data && 'data' in data) {
        data.data.map(function(sub) {
          if (sub.SubFormat !== 'srt') {
            return
          }

          if (query.season && query.episode) {
            if (parseInt(sub.SeriesIMDBParent) !== parseInt(query.imdbid.replace('tt', '')) || sub.SeriesSeason.toString() !== query.season.toString() || sub.SeriesEpisode.toString() !== query.episode.toString()) {
              return
            }
          }
          sub.url = sub.SubDownloadLink.replace('.gz', '.srt')
          output.push(sub)
        })
        return output
      } else {
        return output
      }
    }

    var login = function() {
      return xmlrpc.callMethod('LogIn', ['', '', 'en', 'DuckieTV v1.00']).then(function(result) {
        if (result && 'token' in result) {
          self.token = result.token
          return self.token
        } else {
          return null
        }
      })
    }

    var languages = {
      alb: 'Albanian',
      ara: 'Arabic',
      baq: 'Basque',
      pob: 'Brazilian',
      bul: 'Bulgarian',
      cat: 'Catalan',
      chi: 'Chinese (simplified)',
      zht: 'Chinese (traditional)',
      hrv: 'Croatian',
      cze: 'Czech',
      dan: 'Danish',
      dut: 'Dutch',
      eng: 'English',
      est: 'Estonian',
      fin: 'Finnish',
      fre: 'French',
      glg: 'Galician',
      geo: 'Georgian',
      ger: 'German',
      ell: 'Greek',
      heb: 'Hebrew',
      hin: 'Hindi',
      hun: 'Hungarian',
      ice: 'Icelandic',
      ind: 'Indonesian',
      ita: 'Italian',
      jpn: 'Japanese',
      khm: 'Khmer',
      kor: 'Korean',
      mac: 'Macedonian',
      may: 'Malay',
      nor: 'Norwegian',
      per: 'Persian',
      pol: 'Polish',
      por: 'Portuguese',
      rum: 'Romanian',
      rus: 'Russian',
      scc: 'Serbian',
      sin: 'Sinhalese',
      slo: 'Slovak',
      slv: 'Slovenian',
      spa: 'Spanish',
      swe: 'Swedish',
      tgl: 'Tagalog',
      tha: 'Thai',
      tur: 'Turkish',
      ukr: 'Ukrainian',
      vie: 'Vietnamese'
    }

    var shortCodes = {
      alb: 'al',
      ara: 'eg',
      baq: 'es',
      pob: 'br',
      bul: 'bg',
      cat: 'es',
      chi: 'cn',
      zht: 'cn',
      hrv: 'hr',
      cze: 'cz',
      dan: 'dk',
      dut: 'nl',
      eng: 'gb',
      est: 'ee',
      fin: 'fi',
      fre: 'fr',
      glg: 'es',
      geo: 'ge',
      ger: 'de',
      ell: 'gr',
      heb: 'il',
      hin: 'in',
      hun: 'hu',
      ice: 'is',
      ind: 'id',
      ita: 'it',
      jpn: 'jp',
      khm: 'kh',
      kor: 'kr',
      mac: 'mk',
      may: 'my',
      nor: 'no',
      per: 'ir',
      pol: 'pl',
      por: 'pt',
      rum: 'ro',
      rus: 'ru',
      scc: 'rs',
      sin: 'lk',
      slo: 'sk',
      slv: 'si',
      spa: 'es',
      swe: 'se',
      tgl: 'ph',
      tha: 'th',
      tur: 'tr',
      ukr: 'ua',
      vie: 'vn'
    }

    var service = {
      getLangages: function() {
        return languages
      },
      getShortCodes: function() {
        return shortCodes
      },
      searchEpisode: function(serie, episode) {
        return service.search({
          imdbid: serie.IMDB_ID.replace('tt', ''),
          season: episode.seasonnumber,
          episode: episode.episodenumber
        })
      },
      searchFilename: function(filename) {
        return service.search({
          tag: filename
        })
      },
      search: function(options) {
        return login().then(function(token) {
          var configuredLang = SettingsService.get('subtitles.languages')
          options.sublanguageid = configuredLang.length === 0 ? 'all' : configuredLang.join(',')
          return xmlrpc.callMethod('SearchSubtitles', [token, [options]]).then(function(results) {
            return parseSubtitles(results, options)
          })
        })
      },
      searchString: function(query) {
        return login().then(function(token) {
          var options = {
            query: query
          }

          var configuredLang = SettingsService.get('subtitles.languages')
          options.sublanguageid = configuredLang.length === 0 ? 'all' : configuredLang.join(',')
          return xmlrpc.callMethod('SearchSubtitles', [token, [options]]).then(function(results) {
            return parseSubtitles(results, options)
          })
        })
      }
    }

    return service
  }
])
;
/**
 * Scene name provider
 * Converts Trakt series names into scene torrent names that you can use on search engines.
 */
DuckieTV.factory('SceneNameResolver', ['$q', '$http', 'SceneXemResolver',
  function($q, $http, SceneXemResolver) {
    // credits to Sickbeard's exception list https://raw.github.com/midgetspy/sb_tvdb_scene_exceptions/gh-pages/exceptions.txt
    //
    // filters applied:
    // - Removed `(([12][09][0-9]{2}))` (all years between 19* and 20* within () )
    // - Replaced `\'` with `'`
    // - Replaced surrounding `'` with `"`
    // - Replaced `.` with ` `
    // - Remove special characters `(){}[]/\|:;<>!@#$%^&*-=_+`
    // - line sort

    var episodesWithDateFormat = {}
    var exceptions = {}
    var traktidTvdbidXref = {}

    /**
     * Replace the most common diacritics in English that are most likely to not be used in torrent scene names
     * its not all-inclusive, that list is just too huge, but we can easily add any more that we come across.
     */
    var replaceDiacritics = function(source) {
      return source.replace(/[ÀÁÂÃÄÅ]/g, 'A').replace(/[ÈÉÊË]/g, 'E').replace(/[ÌÍÎÏ]/g, 'I').replace(/[ÒÓÔÕÖ]/g, 'O').replace(/[ÙÚÛÜ]/g, 'U').replace(/[Ç]/g, 'C').replace(/[àáâãäå]/g, 'a').replace(/[èéêë]/g, 'e').replace(/[ìíîï]/g, 'i').replace(/[òóôõö]/g, 'o').replace(/[ùúûü]/g, 'u').replace(/[ç]/g, 'c')
    }

    /**
     * strip the bracketed year, and all special characters apart from space and minus, and replace diacritics
     */
    var filterName = function(source) {
      return replaceDiacritics(source).replace(/\(([12][09][0-9]{2})\)/, '').replace(/[^0-9a-zA-Z- ]/g, '')
    }

    return {
      /**
       * Return the scene name of the provided TRAKT_ID if it's in the list, unfiltered.
       */
      getSceneName: function(traktID, name) {
        traktID = parseInt(traktID)
        return (traktID in exceptions) ? exceptions[traktID] : filterName(name)
      },

      getSearchStringForEpisode: function(serie, episode) {
        var append = (serie.customSearchString && serie.customSearchString != '') ? ' ' + serie.customSearchString : ''
        var traktID = parseInt(serie.TRAKT_ID)
        // Return the scene name of the provided TRAKT_ID if it's in the list, unfiltered.
        var sceneName = (traktID in exceptions) ? exceptions[traktID] + ' ' : filterName(serie.name) + ' '
        if (serie.alias) {
          // replaces sceneName with serie.alias if it has been set. NOTE: alias is unfiltered
          sceneName = serie.alias + ' '
        }
        if (serie.TRAKT_ID in episodesWithDateFormat) {
          if (typeof (moment) === 'undefined') {
            moment = require('./js/vendor/moment.min')
          }

          return $q.resolve(sceneName + moment.tz(episode.firstaired_iso, serie.timezone).format(episodesWithDateFormat[serie.TRAKT_ID]) + append)
        } else {
          return SceneXemResolver.getEpisodeMapping(serie, episode, sceneName, append)
        }
      },

      /**
       * Return a TVDB_ID given the provided TRAKT_ID if it's in the list or null.
       */
      getTvdbidFromTraktid: function(traktID) {
        traktID = parseInt(traktID)
        return (traktID in traktidTvdbidXref) ? traktidTvdbidXref[traktID] : null
      },

      /**
       * Return last TRAKT_ID in traktidTvdbidXref
       */
      getLastTraktidXref: function() {
        return parseInt(Object.keys(traktidTvdbidXref)[Object.keys(traktidTvdbidXref).length-1])
      },

      initialize: function() {
        var lastFetched = ('snrt.lastFetched' in localStorage) ? new Date(parseInt(localStorage.getItem('snrt.lastFetched'))) : new Date()

        if (('snrt.traktid-tvdbid-xref' in localStorage) && lastFetched.getTime() + 86400000 > new Date().getTime()) {
          exceptions = JSON.parse(localStorage.getItem('snrt.name-exceptions'))
          episodesWithDateFormat = JSON.parse(localStorage.getItem('snrt.date-exceptions'))
          traktidTvdbidXref = JSON.parse(localStorage.getItem('snrt.traktid-tvdbid-xref'))
          console.info('Next SNRT update is due after ', new Date(lastFetched.getTime() + 86400000))
          console.info('Fetched SNRT name and date exceptions, and TraktTvdbXref from localStorage.')
        } else {
          $http.get('https://duckietv.github.io/SceneNameExceptions/TraktSceneNameExceptions.json').then(function(response) {
            exceptions = response.data
            localStorage.setItem('snrt.name-exceptions', JSON.stringify(exceptions))
          })

          $http.get('https://duckietv.github.io/SceneNameExceptions/TraktSceneDateExceptions.json').then(function(response) {
            episodesWithDateFormat = response.data
            localStorage.setItem('snrt.date-exceptions', JSON.stringify(episodesWithDateFormat))
          })

          $http.get('https://duckietv.github.io/SceneNameExceptions/TraktidTvdbidXref.json').then(function(response) {
            traktidTvdbidXref = response.data
            localStorage.setItem('snrt.traktid-tvdbid-xref', JSON.stringify(traktidTvdbidXref))
            localStorage.setItem('snrt.lastFetched', new Date().getTime())
          })

          console.info('Updated localStorage with SNRT name and date exceptions, and TraktTvdbXref.')
        }
      }
    }
  }
])

DuckieTV.run(['SceneNameResolver',
  function(SceneNameResolver) {
    SceneNameResolver.initialize()
  }
])
;
DuckieTV
  .factory('SceneXemResolver', ['$q', '$http',
    function($q, $http) {
      var mappings = []
      var aliasmap = []
      var cache = {}
      var logged = []

      var getXemCacheForSerie = function(tvdb_id) {
        if ((tvdb_id in cache)) {
          return $q.resolve(cache[tvdb_id])
        } else {
          return $http.get('https://duckietv.github.io/xem-cache/' + tvdb_id + '.json').then(function(result) {
            cache[tvdb_id] = result.data
            return result.data
          })
        }
      }

      var isNotLogged = function(id) {
        var found = (logged.indexOf(id) > -1)
        if (!found) {
          logged.push(id)
        }

        return !found
      }

      var formatAbsolute = function(absolute, fallback) {
        absolute = absolute || ''
        var abs = absolute.toString()

        return (abs !== '') ? (abs.length === 1) ? '0' + abs : abs : fallback
      }

      var service = {
        initialize: function() {
          var lastFetched = ('xem.lastFetched' in localStorage) ? new Date(parseInt(localStorage.getItem('xem.lastFetched'))) : new Date()

          if (!localStorage.getItem('1.1.5FetchFirstXemAliasMap')) {
            console.info('Executing 1.1.5FetchFirstXemAliasMap')
            localStorage.removeItem('xem.mappings')
            localStorage.setItem('1.1.5FetchFirstXemAliasMap', new Date())
            console.info('1.1.5FetchFirstXemAliasMap done!')
          }

          if (('xem.mappings' in localStorage) && lastFetched.getTime() + 86400000 > new Date().getTime()) {
            mappings = JSON.parse(localStorage.getItem('xem.mappings'))
            console.info('Fetched localstorage Xem series list: ', mappings)
            aliasmap = JSON.parse(localStorage.getItem('xem.aliasmap'))
            console.info('Fetched localstorage Xem series alias map:', aliasmap)
          } else {
            $http.get('https://duckietv.github.io/xem-cache/mappings.json').then(function(response) {
              mappings = response.data
              localStorage.setItem('xem.mappings', JSON.stringify(mappings))
              localStorage.setItem('xem.lastFetched', new Date().getTime())
              console.info('Updating localstorage Xem series list:', mappings)
            })

            $http.get('https://duckietv.github.io/xem-cache/aliasmap.json').then(function(response) {
              aliasmap = response.data
              localStorage.setItem('xem.aliasmap', JSON.stringify(aliasmap))
              console.info('Updating localstorage Xem series alias map:', aliasmap)
            })
          }
        },

        getEpisodeMapping: function(serie, episode, sceneName, append) {
          if (mappings.indexOf(parseInt(serie.TVDB_ID)) > -1) {
            return getXemCacheForSerie(serie.TVDB_ID).then(function(result) {
              var matches = result.filter(function(show) {
                return show.tvdb.season == episode.seasonnumber && show.tvdb.episode == episode.episodenumber
              })

              if (matches.length > 0) {
                if (isNotLogged(serie.TVDB_ID.toString() + episode.getFormattedEpisode() + 'Y')) {
                  console.info('Xem has episode %s for %s (%s), using mapped format.', episode.getFormattedEpisode(), serie.name, serie.TVDB_ID, matches[0].scene)
                }

                if (serie.isAnime()) {
                  return $q.resolve(sceneName + formatAbsolute(matches[0].scene.absolute, episode.getFormattedEpisode()) + append)
                } else {
                  return $q.resolve(sceneName + episode.formatEpisode(matches[0].scene.season, matches[0].scene.episode) + append)
                }
              } else {
                if (isNotLogged(serie.TVDB_ID.toString() + episode.getFormattedEpisode() + 'N')) {
                  console.info('Xem does not have episode %s for %s (%s), using default format.', episode.getFormattedEpisode(), serie.name, serie.TVDB_ID)
                }

                if (serie.isAnime()) {
                  return $q.resolve(sceneName + formatAbsolute(episode.absolute, episode.getFormattedEpisode()) + append)
                } else {
                  return $q.resolve(sceneName + episode.getFormattedEpisode() + append)
                }
              }
            })
          } else {
            if (isNotLogged(serie.TVDB_ID.toString())) {
              console.info('Xem does not have series %s (%s), using default format.', serie.name, serie.TVDB_ID)
            }

            if (serie.isAnime()) {
              return $q.resolve(sceneName + formatAbsolute(episode.absolute, episode.getFormattedEpisode()) + append)
            } else {
              return $q.resolve(sceneName + episode.getFormattedEpisode() + append)
            }
          }
        },
        getXemAliasListForSerie: function(serie) {
          return (serie.TVDB_ID in aliasmap) ? aliasmap[serie.TVDB_ID] : []
        }
      }

      return service
    }
  ])

  .run(['SettingsService', 'SceneXemResolver',
    function(SettingsService, SceneXemResolver) {
      if (SettingsService.get('torrenting.enabled')) {
        console.info('Initializing Xross Entity Mapping (https://thexem.info/) service for Scene Name episode format.')
        SceneXemResolver.initialize()
      }
    }
  ])
;

/**
 * Migrations that run when updating DuckieTV version.
 */
DuckieTV.run(['SettingsService', function(SettingsService) {
  // switch to trakt indexed Scene(Name|Date)Exceptions tables
  if (!localStorage.getItem('1.1.6TraktSceneTables')) {
    console.info('Executing 1.1.6TraktSceneTables')
    localStorage.removeItem('snr.name-exceptions')
    localStorage.removeItem('snr.date-exceptions')
    localStorage.removeItem('snr.lastFetched')
    localStorage.setItem('1.1.6TraktSceneTables', new Date())
    console.info('1.1.6TraktSceneTables done!')
  }
  // switch tpb default domain
  if (!localStorage.getItem('1.1.6TPBorgto0org')) {
    console.info('Executing 1.1.6TPBorgto0org')
    SettingsService.set('ThePirateBay.mirror', 'https://thepiratebay0.org/');
    localStorage.setItem('1.1.6TPBorgto0org', new Date())
    console.info('1.1.6TPBorgto0org done!')
  }
  // delete watchlist
  if (!localStorage.getItem('1.1.6deleteWatchList')) {
    console.info('Executing 1.1.6deleteWatchList')
    CRUD.executeQuery('drop table WatchList')
    CRUD.executeQuery('drop table WatchListObject')
    localStorage.setItem('1.1.6deleteWatchList', new Date())
    console.info('1.1.6deleteWatchList done!')
  }
  // update quality list
  if (!localStorage.getItem('1.1.6updateQualityList')) {
    console.info('Executing 1.1.6updateQualityList')
    SettingsService.set('torrenting.searchqualitylist', ['HDTV', '720p', '1080p', '2160p', 'x265']);
    localStorage.setItem('1.1.6updateQualityList', new Date())
    console.info('1.1.6updateQualityList done!')
  }
}])
;
DuckieTV.factory('SeriesListState', ['$rootScope',
  function($rootScope) {
    var service = {
      state: {
        isShowing: false
      },
      show: function() {
        document.body.scrollTop = 0
        service.state.isShowing = true
        document.body.classList.add('serieslistActive')
      },
      hide: function() {
        document.body.classList.remove('serieslistActive')
        service.state.isShowing = false
      },
      toggle: function() {
        if (!service.state.isShowing) {
          service.show()
        } else {
          service.hide()
        }
        $rootScope.$applyAsync()
      }
    }
    return service
  }
])
;
DuckieTV.factory('SeriesAddingState', ['$rootScope',
  function($rootScope) {
    var service = {
      state: {
        isShowing: false
      },
      show: function() {
        document.body.scrollTop = 0
        service.state.isShowing = true
        document.body.classList.add('seriesaddingActive')
      },
      hide: function() {
        document.body.classList.remove('seriesaddingActive')
        service.state.isShowing = false
      },
      toggle: function() {
        if (!service.state.isShowing) {
          service.show()
        } else {
          service.hide()
        }
        $rootScope.$applyAsync()
      }
    }
    return service
  }
])
;
/**
 * Wrapper from accessing and requesting chrome permissions
 */
DuckieTV.factory('ChromePermissions', ['$q',
  function ($q) {
    var isChrome = navigator.userAgent.toLowerCase().indexOf('chrome') > -1

    var isExtension = (('chrome' in window) && ('permissions' in chrome))

    var service = {
      /**
       * Storage sync only supported in chrome extensions
       */
      isSupported: function () {
        return isChrome && isExtension
      },
      /**
       * Verify that a permission is available in chrome
       */
      checkGranted: function (permission) {
        return $q(function (resolve, reject) {
          console.info('Verify if permission is granted', permission)

          if (!service.isSupported()) {
            console.info('Nope, not chrome or an extension')
            reject()
          }
          chrome.permissions.contains({
            permissions: [permission]
          }, function (supported) {
            console.info(supported ? 'Permission ' + permission + ' granted.' : 'Permission ' + permission + ' denied.')
            return (supported && 'sync' in chrome.storage) ? resolve() : reject()
          })
        })
      },
      requestPermission: function (permission) {
        return $q(function (resolve, reject) {
          console.info('Request permission', permission)

          if (!service.isSupported()) {
            console.info('Nope, not chrome or an extension')
            reject()
          }
          chrome.permissions.request({
            permissions: [permission]
          }, function (granted) {
            console.info(granted ? 'Permission ' + permission + ' granted.' : 'Permission ' + permission + ' denied.')
            return (granted) ? resolve() : reject()
          })
        })
      },
      revokePermission: function (permission) {
        return $q(function (resolve, reject) {
          console.info('Revoke permission', permission)

          if (!service.isSupported()) {
            console.info('Nope, not chrome or an extension')
            reject()
          }
          chrome.permissions.request({
            permissions: [permission]
          }, function (result) {
            console.info(result ? 'Permission ' + permission + ' revoked.' : 'Permission ' + permission + ' not revoked.')
            return (result) ? resolve() : reject()
          })
        })
      }
    }

    return service
  }
])

/**
 * The Settings Service stores user preferences and provides defaults.
 * Storage is in localStorage. values get serialized on save and deserialized on initialization.
 *
 * Shorthands to the get and set functions are provided in $rootScope by the getSetting and setSetting functions
 */
DuckieTV.factory('SettingsService', ['$injector', 'availableLanguageKeys', 'customLanguageKeyMappings',
  function ($injector, availableLanguageKeys, customLanguageKeyMappings) {
    var service = {
      settings: {},
      defaults: {
        'ThePirateBay.mirror': 'https://thepiratebay0.org/',
        'application.language': null,
        'application.locale': 'en_us',
        'aria2.port': 6800,
        'aria2.server': 'http://localhost',
        'aria2.token': '',
        'autobackup.period': 'monthly',
        'autodownload.delay': 15,
        'autodownload.multiSE': {
          'ThePirateBay': true,
          '1337x': true,
          'ETag': true,
          'EXT': true,
          'EzTV.ag': true,
          'Idope': true,
          'IsoHunt2': true,
          'KATws': true,
          'Knaben': true,
          'LimeTorrents': true,
          'Nyaa': true,
          'RarBG': true,
          'ShowRSS': true,
          'TGx': true,
          'TorrentDownloads': true
        },
        'autodownload.multiSE.enabled': false,
        'autodownload.period': 1,
        'background-rotator.opacity': 0.4,
        'biglybt.password': '',
        'biglybt.path': '/transmission/rpc',
        'biglybt.port': 9091,
        'biglybt.progressX100': true,
        'biglybt.server': 'http://localhost',
        'biglybt.use_auth': true,
        'biglybt.username': 'biglybt',
        'calendar.mode': 'date',
        'calendar.show-downloaded': true,
        'calendar.show-episode-numbers': false,
        'calendar.show-specials': true,
        'calendar.startSunday': true,
        'client.determinedlocale': null,
        'deluge.password': 'deluge',
        'deluge.port': 8112,
        'deluge.server': 'http://localhost',
        'deluge.use_auth': true,
        'download.ratings': true,
        'episode.watched-downloaded.pairing': true,
        'font.bebas.enabled': true,
        'kc.always': false,
        'ktorrent.password': 'ktorrent',
        'ktorrent.port': 8080,
        'ktorrent.server': 'http://localhost',
        'ktorrent.use_auth': true,
        'ktorrent.username': 'ktorrent',
        'lastSync': -1,
        'library.order.by': 'getSortName()',
        'library.order.reverseList': [true, false, true, true],
        'library.seriesgrid': true,
        'library.smallposters': true,
        'main.viewmode': 'calendar', // todo || calendar
        'mirror.1337x': 'https://1337x.to',
        'mirror.ETag': 'https://extratorrent.st',
        'mirror.EXT': 'https://ext.to',
        'mirror.EzTVag': 'https://eztv.wf',
        'mirror.Idope': 'https://idope.se',
        'mirror.IsoHunt2': 'https://isohunt.tv',
        'mirror.KATws': 'https://kickass.ws',
        'mirror.Knaben': 'https://knaben.eu',
        'mirror.LimeTorrents': 'https://www.limetorrents.lol',
        'mirror.Nyaa': 'https://nyaa.si',
        'mirror.RarBG': 'https://torrentapi.org/pubapi_v2.php?app_id=DuckieTV&',
        'mirror.ShowRSS': 'https://showrss.info',
        'mirror.ThePirateBay': 'https://thepiratebay0.org/',
        'mirror.TorrentDownloads': 'https://www.torrentdownloads.pro',
        'mirror.TGx': 'https://torrentgalaxy.to',
        'notifications.enabled': true, // chrome notifications for download started/finished
        'qbittorrent.password': 'admin',
        'qbittorrent.port': 8080,
        'qbittorrent.server': 'http://localhost',
        'qbittorrent.use_auth': true,
        'qbittorrent.username': 'admin',
        'qbittorrent32plus.password': 'admin',
        'qbittorrent32plus.port': 8080,
        'qbittorrent32plus.server': 'http://localhost',
        'qbittorrent32plus.use_auth': true,
        'qbittorrent32plus.username': 'admin',
        'rtorrent.path': '/RPC2',
        'rtorrent.port': 80,
        'rtorrent.server': 'http://localhost',
        'rtorrent.use_auth': false,
        'series.displaymode': 'poster',
        'series.not-watched-eps-btn': false,
        'storage.sync': false, // off by default so that permissions must be requested
        'subtitles.languages': ['eng'],
        'sync.progress': true,
        'synology.enabled': false,
        'synology.ip': '192.168.x.x',
        'synology.password': 'password',
        'synology.playback_devices': {},
        'synology.port': 5000,
        'synology.protocol': 'http',
        'synology.username': 'admin',
        'tixati.password': 'admin',
        'tixati.port': 8888,
        'tixati.server': 'http://localhost',
        'tixati.use_auth': true,
        'tixati.username': 'admin',
        'topSites.enabled': true,
        'topSites.mode': 'onhover',
        'torrentDialog.2.activeSE': {
          'ThePirateBay': true,
          '1337x': true,
          'ETag': true,
          'EXT': true,
          'EzTV.ag': true,
          'Idope': true,
          'IsoHunt2': true,
          'KATws': true,
          'Knaben': true,
          'LimeTorrents': true,
          'Nyaa': true,
          'RarBG': true,
          'ShowRSS': true,
          'TGx': true,
          'TorrentDownloads': true
        },
        'torrentDialog.2.enabled': false,
        'torrentDialog.2.sortBy': '+engine',
        'torrentDialog.showAdvanced.enabled': true,
        'torrenting.autodownload': false,
        'torrenting.autostop': true,
        'torrenting.autostop_all': false,
        'torrenting.client': 'uTorrent',
        'torrenting.directory': true,
        'torrenting.enabled': true,
        'torrenting.global_size_max': null,
        'torrenting.global_size_max_enabled': true,
        'torrenting.global_size_min': null,
        'torrenting.global_size_min_enabled': true,
        'torrenting.ignore_keywords': '',
        'torrenting.ignore_keywords_enabled': true,
        'torrenting.label': false,
        'torrenting.launch_via_chromium': false,
        'torrenting.min_seeders': 50,
        'torrenting.min_seeders_enabled': false,
        'torrenting.progress': true,
        'torrenting.require_keywords': '',
        'torrenting.require_keywords_enabled': true,
        'torrenting.require_keywords_mode_or': true,
        'torrenting.searchprovider': 'ThePirateBay',
        'torrenting.searchquality': '',
        'torrenting.searchqualitylist': ['HDTV', '720p', '1080p', '2160p', 'x265'],
        'torrenting.streaming': true,
        'trakt-update.period': 1,
        'trakttv.passwordHash': null,
        'trakttv.sync': false,
        'trakttv.username': null,
        'transmission.password': 'admin',
        'transmission.path': '/transmission/rpc',
        'transmission.port': 9091,
        'transmission.progressX100': true,
        'transmission.server': 'http://localhost',
        'transmission.use_auth': true,
        'transmission.username': 'admin',
        'ttorrent.password': '',
        'ttorrent.port': 1080,
        'ttorrent.server': 'http://localhost',
        'ttorrent.use_auth': true,
        'ttorrent.username': 'admin',
        'utorrentwebui.password': '',
        'utorrentwebui.port': 8080,
        'utorrentwebui.server': 'http://localhost',
        'utorrentwebui.use_auth': true,
        'utorrentwebui.username': 'admin',
        'vuze.password': '',
        'vuze.path': '/transmission/rpc',
        'vuze.port': 9091,
        'vuze.progressX100': true,
        'vuze.server': 'http://localhost',
        'vuze.use_auth': true,
        'vuze.username': 'vuze'
      },
      /**
       * Read a setting key and return either the stored value or the default
       * @param  string key to read
       * @return mixed value value of the setting
       */
      get: function (key) {
        return ((key in service.settings) ? service.settings[key] : (key in service.defaults) ? service.defaults[key] : false)
      },
      /**
       * Store a value in the settings object and persist the changes automatically.
       * @param string key key to store
       * @param mixed value to store
       */
      set: function (key, value) {
        service.settings[key] = value
        if (key === 'calendar.startSunday') {
          $injector.get('datePickerConfig').startSunday = value
        }
        if (key === 'download.ratings') {
          $injector.get('FavoritesService').downloadRatings = value
        }
        service.persist()
      },
      /**
       * Serialize the data and persist it in localStorage
       */
      persist: function () {
        localStorage.setItem('userPreferences', angular.toJson(service.settings, true))
      },
      /**
       * DeSerialise data from localStorage (or if not found then load defaults) and store it in service.settings
       */
      restore: function () {
        if (!localStorage.getItem('userPreferences')) {
          service.defaults['topSites.enabled'] = (!service.isStandalone() && 'chrome' in window && 'topSites' in (window.chrome))
          service.settings = service.defaults
        } else {
          service.settings = angular.fromJson(localStorage.getItem('userPreferences'))
          if (service.isStandalone()) {
            service.settings['topSites.enabled'] = false
          }
        }
      },
      /*
       * Change the UI language and locale to use for translations tmhDynamicLocale
       */
      changeLanguage: function (langKey, locale) {
        console.info('SettingsService.changeLanguage', langKey, locale)
        langKey = langKey.toLowerCase() || 'en_us'
        locale = langKey

        if (availableLanguageKeys.indexOf(langKey) === -1 && Object.keys(customLanguageKeyMappings).indexOf(langKey) === -1 && customLanguageKeyMappings.indexOf(langKey) === -1) {
          var matched = false

          if (langKey.indexOf('_') === -1) {
            for (var key in customLanguageKeyMappings) {
              console.debug(key, langKey, key.indexOf(langKey))
              if (key.indexOf(langKey) > -1) {
                langKey = key
                matched = true
                break
              }
            }
          }
          if (!matched) {
            langKey = locale = 'en_us'
          }
        }

        service.set('application.language', langKey)
        service.set('application.locale', locale)
        $injector.get('tmhDynamicLocale').set(locale) // the SettingsService is also required in the background page and we don't need $translate there
        $injector.get('$translate').use(langKey, locale) // get these via the injector so that we don't have to use these dependencies hardcoded.
        return langKey
      },
      /**
       * is DuckieTV running Standalone?
       * note: Since NWJS 0.13.x, we can just look for the nw object in window.
       *          The legacy way of loading NW.js APIs using require('nw.gui') is supported but no longer necessary. It returns the same nw object.
       */
      isStandalone: function () {
        return ('nw' in window)
      }
    }
    service.restore()
    return service
  }
])

/**
 * rootScope shorthand helper functions.
 */
DuckieTV.run(['$rootScope', 'SettingsService', function ($rootScope, SettingsService) {
  $rootScope.isStandalone = (SettingsService.isStandalone())
  $rootScope.isMac = (navigator.platform.toLowerCase().indexOf('mac') !== -1)
  $rootScope.isAndroid = (navigator.userAgent.toLowerCase().indexOf('android') !== -1)

  $rootScope.getSetting = function (key) {
    return SettingsService.get(key)
  }

  $rootScope.setSetting = function (key, value) {
    return SettingsService.set(key, value)
  }

  $rootScope.enableSetting = function (key) {
    SettingsService.set(key, true)
  }

  $rootScope.disableSetting = function (key) {
    SettingsService.set(key, false)
  }
}])
;
DuckieTV.factory('SidePanelState', ['$rootScope', function($rootScope) {
  var service = {
    state: {
      isShowing: false,
      isExpanded: false
    },
    show: function() {
      if (document.body.scrollHeight > window.innerHeight) {
        document.body.style.overflowY = 'auto'
      }
      document.body.scrollTop = 0

      service.contract()
      if (!service.state.isShowing) {
        document.body.classList.add('sidepanelActive')
        service.state.isShowing = true
        $rootScope.$broadcast('sidepanel:stateChange', true)
      }
    },
    hide: function() {
      document.body.style.overflowY = ''
      service.contract()
      if (service.state.isShowing) {
        service.state.isShowing = false
        document.body.classList.remove('sidepanelActive')
        $rootScope.$broadcast('sidepanel:stateChange', false)
      }
    },
    expand: function() {
      if (!service.state.isExpanded) {
        document.body.classList.add('sidepanelExpanded')
        service.state.isExpanded = true
        $rootScope.$broadcast('sidepanel:sizeChange', true)
      }
    },
    contract: function() {
      if (service.state.isExpanded) {
        document.body.classList.remove('sidepanelExpanded')
        service.state.isExpanded = false
        $rootScope.$broadcast('sidepanel:sizeChange', false)
      }
    }
  }
  return service
}])
;
DuckieTV.factory('SeriesMetaTranslations', ['$filter', '$locale',
  function($filter, $locale) {
    var translatedGenres = $filter('translate')('GENRELIST').split('|')
    var translatedStatuses = $filter('translate')('STATUSLIST').split('|')

    var service = {
      genres: ['action', 'adventure', 'animation', 'anime', 'biography', 'children', 'comedy', 'crime', 'disaster', 'documentary', 'drama', 'eastern', 'family', 'fan-film', 'fantasy', 'film-noir', 'food', 'game-show', 'history', 'holiday', 'home-and-garden', 'horror', 'indie', 'mini-series', 'music', 'musical', 'mystery', 'news', 'none', 'reality', 'road', 'romance', 'science-fiction', 'short', 'soap', 'special-interest', 'sports', 'sporting-event', 'superhero', 'suspense', 'talk-show', 'thriller', 'travel', 'tv-movie', 'war', 'western'],
      statuses: ['canceled', 'ended', 'in production', 'returning series', 'planned'],
      daysOfWeek: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],

      translateGenre: function(genre) {
        var idx = service.genres.indexOf(genre)
        return (idx !== -1) ? translatedGenres[idx] : genre
      },

      translateStatus: function(status) {
        var idx = service.statuses.indexOf(status)
        return (idx !== -1) ? translatedStatuses[idx] : status
      },

      translateDayOfWeek: function(day) {
        return $locale.DATETIME_FORMATS.DAY[service.daysOfWeek.indexOf(day)]
      }
    }

    return service
  }
])
;
/**
 * ****************** NOT IN USE AND LIKELY BROKEN *********************************
 * The StorageSyncService provides synchronized storage to chrome's chrome.storage.sync api.
 * Chrome.storage.sync is called whenever the preference is enabled and stores the current favorite
 * list of series in the cloud.
 * On on other computers you've signed in on, the list of series is fetched and added.
 * When a remote deletion conflict is detected, the user is required to confirm deletion, otherwise the show
 * will be re-added.
 *
 * Note adding shows should happen in the background thread instead of in the current thread for the reason
 * that a user can close or navigate away from the current DuckieTV tab while the addToFavorites promise is
 * still running.
 */
DuckieTV.factory('StorageSyncService', ['$rootScope', '$q', 'FavoritesService', 'SettingsService', '$injector',
  function($q, FavoritesService, SettingsService, $injector) {
    var service = {

      targets: [],
      isSyncing: false, // syncing is currently in progress
      firstRun: false, // first run?
      lastSynced: null, // timestamp when sync has last run
      activeDlg: null, // instance handle to an active question dialog to prevent multiple questions asked at the same time.
      wipeMode: false,

      registerTarget: function(targetName) {
        console.info('Register new storage sync target!', targetName)
        service.targets.push($injector.get(targetName))
      },

      /**
             * Fetch the list of trakt id's from the FavoritesService
             * @returns array of TRAKT_ID's
             */
      getLocalSeriesList: function() {
        return FavoritesService.getSeries().then(function(series) {
          return $q.all(series.map(function(el) {
            return el.TRAKT_ID
          }))
        })
      },

      compareTarget: function(target, resolveInfo) {
        console.log(' Compare to target!', target)
        return service.getLocalSeriesList().then(function(localSeries) {
          return target.getSeriesList().then(function(remoteSeries) {
            console.log(' Compare local to remote series list: ', localSeries, remoteSeries)
            target.nonLocal = remoteSeries === null ? [] : remoteSeries.filter(function(id) {
              return localSeries.indexOf(id) == -1
            })
            console.log(' Non-local series: ', target.nonLocal)

            target.nonRemote = localSeries === null ? [] : localSeries.filter(function(id) {
              return remoteSeries.indexOf(id) == -1
            })
            console.log(' Non-remote series: ', target.nonRemote)

            function fetchDetailedInfo(trakt_id) {
              return TraktTV.enableBatchMode().findSerieByTRAKTID(trakt_id, true).then(function(result) {
                console.log('found serie!')
                return result
              })
            }

            function detailFetchError(err) {
              console.log('Error fetching detailed trakt.tv info:', err)
              return result
            }

            if (resolveInfo) {
              $q.all(target.nonLocal.map(fetchDetailedInfo, detailFetchError)).then(function(results) {
                target.nonLocal = results
              })
              $q.all(target.nonRemote.map(fetchDetailedInfo, detailFetchError)).then(function(results) {
                target.nonRemote = results
              })
            }
          })
        })
      },

      /**
             * Execute a sync (write) step if syncing is not currently already in progress
             */
      synchronize: function() {
        if (service.isSyncing) {
          console.info('Storage sync: Not synchronizing, already working.')
          return
        }
        console.log('Storage sync: Starting sync process on registered target')
        $q.all(service.targets.map(function(target) {
          return target.sync(watchedList)
        }, function(err) {
          // an error occured during sync
          debugger
        })).then(function() {
          SettingsService.set('lastSync', time)
          service.isSyncing = false
        })
      },

      initialize: function() {

      }

    }
    return service
  }
])

/**
 * Initialize storage sync
 */
  .run(['StorageSyncService', function(StorageSyncService) {
    StorageSyncService.initialize()
  }])
;
/**
 * A service that stores a list of all known torrents and their downloaded state in localStorage.
 * Used to detect when a torrent has been removed and can be flushed from the database, and to not
 * have to execute queries for shows that have already been marked as watched in the database.
 */
DuckieTV.factory('TorrentHashListService', [

  function() {
    function persist() {
      localStorage.setItem(['torrenting.hashList'], JSON.stringify(service.hashList))
    }

    // clean up old array format.
    if ('torrenting.hashList' in localStorage) {
      if (JSON.parse(localStorage.getItem('torrenting.hashList')).constructor === Array) {
        localStorage.removeItem('torrenting.hashList')
      }
    }
    var service = {
      /**
             *  a list of torrent magnet hashes which are being managed by DuckieTV
             */
      hashList: JSON.parse(localStorage.getItem(['torrenting.hashList'])) || {},
      /**
             * only add to list if we don't already have it, store for persistence.
             */
      addToHashList: function(torrentHash) {
        if (window.debug982) console.debug('TorrentHashListService.addToHashList(%s)', torrentHash)
        if (!service.hasHash(torrentHash)) {
          service.hashList[torrentHash] = false
          persist()
        }
        return true
      },
      /**
             * used by the remove torrent feature (uTorrent and BaseTorrentClient)
             */
      removeFromHashList: function(torrentHash) {
        if (window.debug982) console.debug('TorrentHashListService.removeFromHashList(%s)', torrentHash)
        if (service.hasHash(torrentHash)) {
          delete service.hashList[torrentHash]
          persist()
        }
        return true
      },
      /**
             * Default state of a torrent in the hashlist is false, when it's downloaded it flips to true
             */
      markDownloaded: function(torrentHash) {
        if (service.hasHash(torrentHash)) {
          if (window.debug982) console.debug('TorrentHashListService.markDownloaded(%s)', torrentHash)
          service.hashList[torrentHash] = true
          persist()
        }
      },
      /**
             *
             */
      isDownloaded: function(torrentHash) {
        return ((torrentHash in service.hashList) && service.hashList[torrentHash] === true)
      },
      /**
             * returns true if torrentHash is in the list, false if not found
             */
      hasHash: function(torrentHash) {
        return (torrentHash in service.hashList)
      }
    }
    return service
  }
])
;
/**
 * A generic abstraction for adding global event hooks that are executed upon every torrent update
 * Currently used for autoStop and mark-downloaded hook. this will be the point to also inject other nifty stuff in the future
 * Like:
 * - Matching incoming torrents names / filenames to existing series/episodes in the database
 */
DuckieTV

  .factory('TorrentMonitor', ['$rootScope', 'DuckieTorrent', 'SettingsService', 'TorrentHashListService', 'FavoritesService', 'NotificationService',
    function($rootScope, DuckieTorrent, SettingsService, TorrentHashListService, FavoritesService, NotificationService) {
      /**
         * Event that gets called on each torrentdata instance when it updates
         * If the progress is 100%, the torrent is stopped based on:
         * autostop all enabled? always stop the torrent
         * autostop all disabled & autostop enabled? stop the torrent only if it was added by DuckieTV.
         */
      function autoStop(torrent) {
        var torrenthash = ('hash' in torrent) ? torrent.hash.toUpperCase() : undefined
        if (torrent.isStarted() && torrent.getProgress() === 100) {
          // active torrent. do we stop it?
          if (SettingsService.get('torrenting.autostop_all')) {
            // all torrents  in the torrent-client are allowed to be stopped. Stopping torrent.
            console.info('Torrent finished. Auto-stopping', torrent.name || torrenthash)
            torrent.stop()
          } else {
            if (SettingsService.get('torrenting.autostop')) {
              // only torrents launched by DuckieTV in the torrent-client are allowed to be stopped
              if (TorrentHashListService.hasHash(torrenthash)) {
                // this torrent was launched by DuckieTV. Stopping torrent.
                console.info('Torrent finished. Auto-stopping', torrent.name || torrenthash)
                torrent.stop()
              }
            }
          }
        }
      }

      /**
         * A check that runs on each torrentdata update to see if the progress is 100% and the torrent hasn't been marked
         * as downloaded yet.
         * If not marked, updates the database and the torrenthashlist service so that this doesn't have to happen again
         */
      function isDownloaded(torrent) {
        var debugNotify = function(notificationId) { if (window.debug982) console.debug('TM notify id', notificationId) }
        var torrentHash = ('hash' in torrent) ? torrent.hash.toUpperCase() : undefined
        if (TorrentHashListService.hasHash(torrentHash) && !TorrentHashListService.isDownloaded(torrentHash) && torrent.getProgress() == 100) {
          CRUD.FindOne('Episode', {
            magnetHash: torrentHash
          }).then(function(episode) {
            TorrentHashListService.markDownloaded(torrentHash)
            if (!episode) {
              if (window.debug982) console.debug('TorrentMonitor: non-episode hash(%s) torrent.name(%s) downloaded', torrentHash, torrent.name)
              NotificationService.notify(
                'Torrent finished',
                torrent.name,
                debugNotify
              )
            } else {
              var episodeDetails = [
                FavoritesService.getByID_Serie(episode.ID_Serie).name,
                episode.getFormattedEpisode(),
                torrent.name
              ].join(' ')
              if (window.debug982) console.debug('TorrentMonitor: episode hash(%s) torrent.name(%s) episodeDetails(%s) downloaded', torrentHash, torrent.name, episodeDetails)
              NotificationService.notify('Torrent finished', episodeDetails, debugNotify)
              episode.markDownloaded($rootScope).then(function(result) {
                console.info('Episode marked as downloaded in database. ', episodeDetails)
              })
            }
          })
        }
      }

      var service = {
        enableAutoStop: function() {
          DuckieTorrent.getClient().getRemote().onTorrentUpdate('', autoStop)
        },
        disableAutoStop: function() {
          DuckieTorrent.getClient().getRemote().offTorrentUpdate('', autoStop)
        },
        downloadedHook: function() {
          DuckieTorrent.getClient().getRemote().onTorrentUpdate('', isDownloaded)
        }
      }
      return service
    }
  ])

  .run(['SettingsService', 'TorrentMonitor', 'DuckieTorrent',
    function(SettingsService, TorrentMonitor, DuckieTorrent) {
      if (SettingsService.get('torrenting.enabled')) {
        DuckieTorrent.getClient().AutoConnect()
        if (SettingsService.get('torrenting.autostop')) {
          console.info('Enabling torrent auto-stop!')
          TorrentMonitor.enableAutoStop()
        }
        TorrentMonitor.downloadedHook()
      }
    }
  ])
;
DuckieTorrent.factory('BaseTorrentRemote', ['$rootScope', 'TorrentHashListService',
  function($rootScope, TorrentHashListService) {
    function BaseTorrentRemote() {
      this.torrents = {}
      this.dataClass = null
      this.offMethods = {} // callbacks map to de-register $rootScope.$on events
    }

    BaseTorrentRemote.prototype.handleEvent = function(data) {
      if (('hash' in data) && (data.hash !== undefined)) {
        var key = data.hash.toUpperCase()
        if (!(key in this.torrents)) {
          if (!this.dataClass) {
            throw 'No data class set for this torrent remote!'
          }
          this.torrents[key] = new this.dataClass(data)
        } else {
          this.torrents[key].update(data)
        }

        $rootScope.$broadcast('torrent:update:' + key, this.torrents[key])
        $rootScope.$broadcast('torrent:update:', this.torrents[key])
      }
    }

    BaseTorrentRemote.prototype.getTorrents = function() {
      var out = []
      angular.forEach(this.torrents, function(el) {
        if ('hash' in el) {
          out.push(el)
        }
      })
      return out
    }

    BaseTorrentRemote.prototype.getByHash = function(hash) {
      if (!hash) return null
      // sometimes hash is passed as an Array (culprit unknown) instead of an expected String!!!
      hash = angular.isArray(hash) ? (hash[0]).toUpperCase() : hash.toUpperCase()
      return (hash in this.torrents) ? this.torrents[hash] : null
    }

    BaseTorrentRemote.prototype.onTorrentUpdate = function(hash, callback) {
      var key = 'torrent:update:' + hash
      if (!(key in this.offMethods)) {
        this.offMethods[key] = []
      }
      this.offMethods[key].push($rootScope.$on(key, function(evt, torrent) {
        callback(torrent)
      }))
    }

    BaseTorrentRemote.prototype.offTorrentUpdate = function(hash, callback) {
      var key = 'torrent:update:' + hash

      if ((key in this.offMethods)) {
        this.offMethods[key].map(function(dereg) {
          dereg()
        })
      }
    }

    BaseTorrentRemote.prototype.removeTorrent = function(activeTorrentsList) {
      // determine which torrents in BaseTorrentRemote.torrents have been removed on the TorrentHost.
      var self = this
      angular.forEach(self.torrents, function(torrent) {
        if ('hash' in torrent) {
          var torrenthash = torrent.hash.toUpperCase()
          if (activeTorrentsList.indexOf(torrenthash) == -1) {
            Episode.findOneByMagnetHash(torrenthash).then(function(result) {
              if (result) {
                console.info('remote torrent not found, removed magnetHash[%s] from episode[%s] of series[%s]', result.magnetHash, result.getFormattedEpisode(), result.ID_Serie)
                result.magnetHash = null
                result.Persist()
              }
            })
            TorrentHashListService.removeFromHashList(torrenthash)
            delete self.torrents[torrenthash].hash
            $rootScope.$broadcast('torrent:update:' + torrenthash, self.torrents[torrenthash])
            $rootScope.$broadcast('torrent:update:', self.torrents[torrenthash])
          }
        }
      })
      this.torrents = self.torrents
    }

    return BaseTorrentRemote
  }
])

  .factory('BaseTorrentClient', ['$rootScope', '$q', '$http', 'URLBuilder', '$parse', 'SettingsService',
    function($rootScope, $q, $http, URLBuilder, $parse, SettingsService) {
      var BaseTorrentClient = function() {
        this.config = {
          uses_custom_auth_method: false
        }

        this.configMappings = {
          server: null,
          port: null,
          username: null,
          password: null,
          use_auth: null,
          path: null
        }

        this.name = 'Base Torrent Client'
        this.remoteClass = null
        this.apiImplementation = null

        this.isPolling = false
        this.isConnecting = false
        this.connected = false
        this.initialized = false
        this.offline = false
      }

      var methods = {
        setConfig: function(config) {
          this.config = config
          this.apiImplementation.config = this.config
        },

        saveConfig: function() {
          Object.keys(this.configMappings).map(function(key) {
            SettingsService.set(this.configMappings[key], this.apiImplementation.config[key])
          }, this)
        },
        readConfig: function() {
          Object.keys(this.configMappings).map(function(key) {
            this.apiImplementation.config[key] = this.config[key] = SettingsService.get(this.configMappings[key])
          }, this)
        },
        setName: function(name) {
          this.name = name
        },
        getName: function(name) {
          return this.name
        },

        setConfigMappings: function(mappings) {
          Object.keys(mappings).map(function(key) {
            this.configMappings[key] = mappings[key]
          }, this)
        },
        setEndpoints: function(endpoints) {
          Object.keys(endpoints).map(function(key) {
            this.apiImplementation.endpoints[key] = endpoints[key]
          }, this)
        },

        setRemote: function(remoteImplementation) {
          this.remoteClass = remoteImplementation
        },

        setAPI: function(apiImplementation) {
          this.apiImplementation = apiImplementation
        },

        getAPI: function() {
          return this.apiImplementation
        },

        /**
             * Return the interface that handles the remote data.
             */
        getRemote: function() {
          if (this.remoteClass === null) {
            throw 'No torrent remote assigned to ' + this.getName() + 'implementation!'
          }
          return this.remoteClass
        },

        /**
             * Connect with an auth token obtained by the Pair function.
             * Store the resulting session key in $scope.session
             * You can call this method as often as you want. It'll return a promise that holds
             * off on resolving until the client is connected.
             * If it's connected and initialized, a promise will return that immediately resolves with the remote interface.
             */
        retryTimeout: null,
        AutoConnect: function() {
          if (!this.offline && !this.isConnecting && !this.connected) {
            this.connectPromise = $q.defer()
            this.isConnecting = true
          } else {
            return (!this.connected || !this.initialized) ? this.connectPromise.promise : $q(function(resolve) {
              resolve(this.getRemote())
            }.bind(this))
          }
          var self = this
          this.connect().then(function(result) {
            console.info(self.getName() + ' connected!')
            if (!self.isPolling) {
              self.isPolling = true
              self.Update()
            }
            self.connectPromise.resolve(self.getRemote())
          }, function(error) {
            self.isPolling = false
            self.isConnnecting = false
            self.connected = false
            self.offline = true
            clearTimeout(self.retryTimeout)
            self.retryTimeout = setTimeout(function() {
              self.offline = false
              self.AutoConnect()
            }, 15000)
            console.info('Unable to connect to ' + self.getName() + ' Retry in 15 seconds')
            self.connectPromise.reject('Not connected.')
            return false
          })

          return self.connectPromise.promise
        },

        togglePolling: function() {
          this.isPolling = !this.isPolling
          this.Update()
        },
        /**
             * Start the status update polling.
             * Stores the resulting TorrentClient service in $scope.rpc
             * Starts polling every 1s.
             */
        Update: function(dontLoop) {
          if (this.isPolling === true) {
            var self = this
            this.getTorrents().then(function(data) {
              if (undefined === dontLoop && self.isPolling && !data.error) {
                setTimeout(function() {
                  self.Update()
                }, 3000)
              }
            })
          }
        },

        isConnecting: function() {
          return this.isConnecting
        },

        isConnected: function() {
          return this.connected
        },

        Disconnect: function() {
          this.isPolling = false
          this.getRemote().torrents = {}
          this.getRemote().eventHandlers = {}
        },

        hasTorrent: function(torrent) {
          return $q.resolve(torrent in this.getRemote().torrents && 'hash' in this.getRemote().torrents[torrent])
        },

        /**
             * -------------------------------------------------------------
             * Optionally overwrite the implementation of the methods below when adding a new torrent client.
             * You shouldn't have to, your API implementation should do the work.
             * -------------------------------------------------------------
             */

        /**
             *
             *
             * Example:
             *        return request('portscan').then(function(result) { // check if client WebUI is reachable
             *   console.log(service.getName() + " check result: ", result);
             *   self.connected = true; // we are now connected
             *   self.isConnecting = false; // we are no longer connecting
             *   return true;
             *  })
             */
        connect: function() {
          var self = this
          return this.getAPI().portscan().then(function(result) { // check if client WebUI is reachable
            // console.debug(self.getName() + " check result: ", result);
            if (!result) {
              self.isConnecting = false
              self.connected = false
              self.isPolling = false
              throw self.getName() + ' Connect call failed.'
            }
            self.connected = result // we are now connected
            self.isConnecting = !result // we are no longer connecting
            $rootScope.$broadcast('torrentclient:connected', self.getRemote())
            return result
          })
        },

        /**
             * Execute and handle the API's 'update' query.
             * Parses out the events, updates, properties and methods and dispatches them to the TorrentRemote interface
             * for storage, handling and attaching RPC methods.
             */

        getTorrents: function() {
          var self = this

          var remote = this.getRemote()
          return this.getAPI().getTorrents()
            .then(function(data) {
              var activeTorrents = []
              data.map(function(torrent) {
                remote.handleEvent(torrent)
                activeTorrents.push(torrent.hash.toUpperCase())
              })
              remote.removeTorrent(activeTorrents)
              return data
            }, function(error) {
              throw 'Error executing ' + self.getName() + ' getTorrents'
            })
        },

        /**
             * Implement this function to be able to add a magnet to the client
             */
        addMagnet: function(magnet, dlPath, label) {
          if (!('addMagnet' in this.getAPI())) {
            throw 'addMagnet not implemented for ' + this.getName()
          }
          return this.getAPI().addMagnet(magnet, dlPath, label)
        },

        /**
             * Implement this function to be able to add a torrent by URL to the client.
             */
        addTorrentByUrl: function(url, infoHash, releaseName, dlPath, label) {
          if (!('addTorrentByUrl' in this.getAPI())) {
            throw 'addTorrentByUrl not implemented for ' + this.getName()
          }
          return this.getAPI().addTorrentByUrl(url, infoHash, releaseName, dlPath, label)
        },

        /**
             * Implement this function to be able to add a torrent by torrent Blob to the client.
             */
        addTorrentByUpload: function(data, infoHash, releaseName, dlPath, label) {
          if (!('addTorrentByUpload' in this.getAPI())) {
            throw 'addTorrentByUpload not implemented for ' + this.getName()
          }
          return this.getAPI().addTorrentByUpload(data, infoHash, releaseName, dlPath, label)
        },

        /**
             * the default is that the client does not support setting the Download Path when adding magnets and .torrents.
             */
        isDownloadPathSupported: function() {
          if (!('isDownloadPathSupported' in this.getAPI())) {
            return false
          }
          return this.getAPI().isDownloadPathSupported()
        },

        /**
             * the default is that the client does not support setting a Label when adding magnets and .torrents.
             */
        isLabelSupported: function() {
          if (!('isLabelSupported' in this.getAPI())) {
            return false
          }
          return this.getAPI().isLabelSupported()
        },

        request: function(type, params, options) {
          return request(type, params, options)
        }

      }

      Object.keys(methods).map(function(key) {
        BaseTorrentClient.prototype[key] = methods[key]
      })

      return BaseTorrentClient
    }
  ])
;
/**
 * Base object for holding Torrent Data.
 * Individual clients extend this and implement the methods to adhere to the DuckieTorrent interface.
 */
function TorrentData(data) {
  this.files = []
  this.update(data)
}

TorrentData.prototype.getClient = function() {
  return angular.element(document.body).injector().get('DuckieTorrent').getClient()
}

/**
 * Round a number with Math.floor so that we don't lose precision on 99.7%
 */
TorrentData.prototype.round = function(x, n) {
  return Math.floor(x * Math.pow(10, n)) / Math.pow(10, n)
}

/**
 * load a new batch of data into this object
 */
TorrentData.prototype.update = function(data) {
  if (!data) {
    return
  }
  Object.keys(data).map(function(key) {
    this[key] = data[key]
  }, this)
}

/**
 * Display name for torrent
 */
TorrentData.prototype.getName = function() {
  throw 'function not implemented'
}

/**
 * Progress percentage 0-100. round to one digit to make sure that torrents are not stopped before 100%.
 */
TorrentData.prototype.getProgress = function() {
  throw 'function not implemented'
}

/**
 * Send start command to the torrent client implementation for this torrent.
 */
TorrentData.prototype.start = function() {
  throw 'function not implemented'
}

/**
 * Send stop command to the torrent client implementation for this torrent.
 */
TorrentData.prototype.stop = function() {
  throw 'function not implemented'
}

/**
 * Send pause command to the torrent client implementation for this torrent.
 */
TorrentData.prototype.pause = function() {
  throw 'function not implemented'
}

/**
 * Send remove command to the torrent client implementation for this torrent.
 */
TorrentData.prototype.remove = function() {
  throw 'function not implemented'
}

/**
 * Send get files command to the torrent client implementation for this torrent.
 */
TorrentData.prototype.getFiles = function() {
  throw 'function not implemented'
}

/**
 * Send isStarted query to the torrent client implementation for this torrent.
 * @returns boolean
 */
TorrentData.prototype.isStarted = function() {
  throw 'function not implemented'
}

/**
 * Get torrent download speed in B/s
 */
TorrentData.prototype.getDownloadSpeed = function() {
  throw 'function not implemented'
}
;
/**
 * Aria2 web client implementation
 *
 * API Docs:
 * https://aria2.github.io/manual/en/html/aria2c.html#rpc-interface
 *
 * JSON-RPC API listens on localhost:6800 by default
 * to set up aria2 see https://github.com/SchizoDuckie/DuckieTV/wiki/Setting-up-Aria2-with-DuckieTV
 * example win startup c:/programdata/aria2c/aria2c --conf-path=c:/home/garfield69/.aria2.conf
 *
 * - supports setting the download directory
 * - Does not support setting or fetching a Label
 */

/**
 *
 * Aria2Data is the main wrapper for a torrent info object coming from Aria2.
 * It extends the base TorrentData class.
 *
 */
var Aria2Data = function(data) {
  this.update(data)
}

// https://aria2.github.io/manual/en/html/aria2c.html#aria2.tellStatus
Aria2Data.extends(TorrentData, {
  getName: function() {
    return this.name
  },
  getProgress: function() {
    return this.round(100 * parseInt(this.completedLength) / parseFloat(this.totalLength), 1)
  },
  getDownloadSpeed: function() {
    return this.downloadSpeed // Bytes/second
  },
  start: function() {
    return this.getClient().getAPI().execute('unpause', [this.gid])
  },
  stop: function() {
    return this.getClient().getAPI().execute('pause', [this.gid])
  },
  pause: function() {
    return this.stop()
  },
  remove: function() {
    var self = this
    return this.getClient().getAPI().execute('remove', [this.gid]).then(function() {
      return self.getClient().getAPI().getTorrents()
    })
  },
  isStarted: function() {
    return this.status === 'active'
  },
  getFiles: function() {
    if (!this.files) {
      this.files = []
    }
    return this.getClient().getAPI().getFiles(this.gid).then(function(data) {
      this.files = data
      return data
    }.bind(this))
  },
  getDownloadDir: function() {
    return this.dir
  }
})

/**
 * Aria2 remote singleton that receives the incoming data
 */
DuckieTorrent.factory('Aria2Remote', ['BaseTorrentRemote',
  function(BaseTorrentRemote) {
    var Aria2Remote = function() {
      BaseTorrentRemote.call(this)
      this.dataClass = Aria2Data
    }
    Aria2Remote.extends(BaseTorrentRemote)

    return Aria2Remote
  }
])

  .factory('Aria2API', ['BaseHTTPApi', '$http', '$q',
    function(BaseHTTPApi, $http, $q) {
      var Aria2API = function() {
        BaseHTTPApi.call(this)
      }
      Aria2API.extends(BaseHTTPApi, {
        portscan: function() {
        var self = this
        self.config.version = 1.32 // first supported version
          return this.execute('getVersion').then(function(result) {	// JSON object
            var enabledFeatures = result && result.enabledFeatures || []
            if (result && result.version) {
              self.config.version = parseFloat(result.version)
            }
            return enabledFeatures.indexOf('BitTorrent') > -1
          }, function() {
            return false
          })
        },

        getTorrents: function() {
          var self = this
          // bah! the tellStatus method only works for one gid, and so
          // we need to make 3 requests to the other tell* methods to list all the torrents :-(
          var torrents = []
          var token = 'token:' + (this.config.token || '')
          var paramArray = [[
            {'methodName': 'aria2.tellActive',
              'params': [token]},
            {'methodName': 'aria2.tellWaiting',
              'params': [token, 0, 9999]},
            {'methodName': 'aria2.tellStopped',
              'params': [token, 0, 9999]}
          ]]
          return $http.post(this.getUrl('jsonrpc'), {
            jsonrpc: '2.0',
            method: 'system.multicall',
            id: 'DuckieTV',
            params: paramArray
          }).then(function(response) {
            var jsonObject = response && response.data || {}
            if (jsonObject.result) {
              jsonObject.result.map(function(tellResults) {
                tellResults.map(function(torrentList) {
                  torrentList.map(function(torrent) {
                    //console.debug(torrent)
                    if ((torrent.bitfield && torrent.bitfield !== '80' && torrent.bitfield !== 'c0') && (torrent.status && torrent.status !== 'removed')) {
                      // not interested in completed metadata records (bitfield 80 or c0), or removed torrents
                      torrents.push(torrent)
                    }
                  })
                })
              })
            }
            return torrents.map(function(dl) {
              dl.hash = dl.infoHash
              if (dl.bittorrent && dl.bittorrent.info) {
                dl.name = dl.bittorrent.info.name ? dl.bittorrent.info.name : dl.infoHash
                return dl
              }
              dl.name = dl.files && dl.files.reduce(function(maxSizedFile, file) {
                return maxSizedFile.length < file.length ? file : maxSizedFile
              }, {length: 0}).path
              dl.name = dl.name && dl.name.split(/[\\/]/).pop() || ('' + dl.gid)
              return dl
            })
          }, function() {
            return []
          })
        },

        getFiles: function(gid) {
          return this.execute('tellStatus', [gid, ['files']]).then(function(result) {	// JSON object
            return result && result.files && result.files.map(function(file) {
              file.name = file.path
              return file
            }) || []
          }, function() {
            return []
          })
        },

        addMagnet: function(magnet, dlPath) {
          return this.execute('addUri', dlPath ? [[magnet], {dir: dlPath}] : [[magnet]])
        },

        addTorrentByUrl: function(url, infoHash, releaseName, dlPath) {
          return this.execute('addUri', dlPath ? [[url], {dir: dlPath}] : [[url]])
        },

        addTorrentByUpload: function(data, infoHash, releaseName, dlPath) {
          var self = this
          return new PromiseFileReader().readAsDataURL(data).then(function(contents) {
            var key = 'base64,'; var index = contents.indexOf(key)
            if (index > -1) {
              return self.execute('addTorrent', dlPath ? [contents.substring(index + key.length), [], {dir: dlPath}] : [contents.substring(index + key.length)])
            }
          })
        },

        isDownloadPathSupported: function() {
          return true
        },

        execute: function(method, paramArray) {
          paramArray = paramArray || []
          paramArray.unshift('token:' + (this.config.token || ''))
          return $http.post(this.getUrl('jsonrpc'), {
            jsonrpc: '2.0',
            method: 'aria2.' + method,
            id: 'DuckieTV',
            params: paramArray
          }).then(function(response) {
            var jsonObject = response && response.data || {}
            // console.error(method + ": " + JSON.stringify(jsonObject))
            return (jsonObject.result) ? jsonObject.result : null
          }, function() {
            return false
          })
        }
      })

      return Aria2API
    }
  ])

  .factory('Aria2', ['BaseTorrentClient', 'Aria2Remote', 'Aria2API',
    function(BaseTorrentClient, Aria2Remote, Aria2API) {
      var Aria2 = function() {
        BaseTorrentClient.call(this)
      }
      Aria2.extends(BaseTorrentClient)

      var service = new Aria2()

      service.setName('Aria2')
      service.setAPI(new Aria2API())
      service.setRemote(new Aria2Remote())
      service.setConfigMappings({
        server: 'aria2.server',
        port: 'aria2.port',
        token: 'aria2.token'
      })
      service.setEndpoints({
        jsonrpc: '/jsonrpc'
      })
      service.readConfig()

      return service
    }
  ])

  .run(['DuckieTorrent', 'Aria2', 'SettingsService',
    function(DuckieTorrent, Aria2, SettingsService) {
      if (SettingsService.get('torrenting.enabled')) {
        DuckieTorrent.register('Aria2', Aria2)
      }
    }
  ])
;
/**
 * BiglyBT has *exactly* the same API as Transmission, so we'll just use that whole implementation and change the config
 * it reads from.
 */
DuckieTorrent.factory('BiglyBT', ['BaseTorrentClient', 'TransmissionRemote', 'TransmissionAPI',
  function(BaseTorrentClient, TransmissionRemote, TransmissionAPI) {
    var BiglyBT = function() {
      BaseTorrentClient.call(this)
    }
    BiglyBT.extends(BaseTorrentClient, {})

    var service = new BiglyBT()
    service.setName('BiglyBT')
    service.setAPI(new TransmissionAPI())
    service.setRemote(new TransmissionRemote())
    service.setConfigMappings({
      server: 'biglybt.server',
      port: 'biglybt.port',
      path: 'biglybt.path',
      username: 'biglybt.username',
      password: 'biglybt.password',
      use_auth: 'biglybt.use_auth',
      progressX100: 'biglybt.progressX100'
    })
    service.readConfig()

    return service
  }
])

  .run(['DuckieTorrent', 'BiglyBT', 'SettingsService',
    function(DuckieTorrent, BiglyBT, SettingsService) {
      if (SettingsService.get('torrenting.enabled')) {
        DuckieTorrent.register('BiglyBT', BiglyBT)
      }
    }
  ])
;
/**
 * Deluge web client implementation
 *
 * API Docs:
 * deluge support have updated their docs and the modules section is currently blank :-(
 * https://deluge.readthedocs.org/en/develop/modules/deluge.ui.web.html
 *
 * http://deluge.readthedocs.io/en/develop/index.html
 *
 * - Supports setting download directory
 * - Does not supports setting a label during add.torrent
 */
var DelugeData = function(data) {
  this.update(data)
}

DelugeData.extends(TorrentData, {
  getName: function() {
    return this.name
  },
  getProgress: function() {
    return this.round(this.progress, 1)
  },
  getDownloadSpeed: function() {
    return this.download_payload_rate // Bytes/second
  },
  start: function() {
    this.getClient().getAPI().execute('core.resume_torrent', [[this.hash]])
  },
  stop: function() {
    this.getClient().getAPI().execute('core.pause_torrent', [[this.hash]])
  },
  pause: function() {
    this.stop()
  },
  remove: function() {
    this.getClient().getAPI().execute('core.remove_torrent', [this.hash, false])
  },
  isStarted: function() {
    return ['Downloading', 'Seeding', 'Active'].indexOf(this.state) > -1
  },
  getFiles: function() {
    if (!this.files) {
      this.files = []
    }
    return this.getClient().getAPI().getFiles(this.hash).then(function(result) {
      this.files = result
      return result
    }.bind(this))
  },
  getDownloadDir: function() {
    return this.save_path
  }
})

DuckieTorrent.factory('DelugeRemote', ['BaseTorrentRemote',
  function(BaseTorrentRemote) {
    var DelugeRemote = function() {
      BaseTorrentRemote.call(this)
      this.dataClass = DelugeData
    }
    DelugeRemote.extends(BaseTorrentRemote)

    return DelugeRemote
  }
])

  .factory('DelugeAPI', ['BaseHTTPApi', '$http',
    function(BaseHTTPApi, $http) {
      var DelugeAPI = function() {
        BaseHTTPApi.call(this)
        this.requestCounter = 0
      }
      DelugeAPI.extends(BaseHTTPApi, {

        rpc: function(method, params, options) {
          var self = this

          var headers = {
            'Content-Type': 'application/json'
          }

          var request = {
            method: method,
            params: params || [],
            id: this.requestCounter++
          }

          return $http.post(this.getUrl('rpc'), request, {headers: headers}).then(function(response) {
            return response.data
          }, function(e, f) {
            throw e
          })
        },
        portscan: function() {
          var self = this
          return this.rpc('auth.check_session').then(function(result) {
            return result !== undefined ? self.rpc('auth.login', [self.config.password]).then(function(response) {
              // console.debug("Auth result: ", response.result);
              return response.result
            }) : false
          }, function() {
            return false
          })
        },
        getTorrents: function() {
          return this.rpc('web.update_ui', [
            ['queue', 'hash', 'name', 'total_wanted', 'state', 'progress', 'num_seeds', 'total_seeds', 'num_peers', 'total_peers', 'download_payload_rate', 'upload_payload_rate', 'eta', 'ratio', 'distributed_copies', 'is_auto_managed', 'time_added', 'tracker_host', 'save_path', 'total_done', 'total_uploaded', 'max_download_speed', 'max_upload_speed', 'seeds_peers_ratio'], {}
          ]).then(function(data) {
            var output = []
            Object.keys(data.result.torrents).map(function(hash) {
              output.push(data.result.torrents[hash])
            })
            return output
          })
        },
        getFiles: function(magnetHash) {
          function flattenFiles(object, output) {
            if (!output) {
              output = []
            }
            if (object.type == 'dir') {
              Object.keys(object.contents).map(function(key) {
                return flattenFiles(object.contents[key], output)
              })
            } else {
              if (object.path) {
                output.push({
                  name: object.path
                })
              }
            }
            return output
          }
          return this.rpc('web.get_torrent_files', [magnetHash]).then(function(response) {
            if (response.result) {
              return flattenFiles(response.result)
            } else {
              return []
            }
          })
        },
        addMagnet: function(magnetHash, dlPath) {
          var options = {}
          if (dlPath !== undefined && dlPath !== null) {
            options = {'download_location': dlPath}
          }
          return this.rpc('web.add_torrents', [
            [{
              options: options,
              path: magnetHash
            }]
          ]).then(function(response) {
            // console.debug(magnetHash, dlPath, response);
          })
        },
        addTorrentByUpload: function(data, infoHash, releaseName, dlPath) {
          var self = this
          var headers = {
            'Content-Type': undefined
          }

          var fd = new FormData()
          fd.append('file', data, releaseName + '.torrent')

          return $http.post(this.getUrl('upload'), fd, {
            transformRequest: angular.identity,
            headers: headers
          }).then(function(response) {
            return this.addMagnet(response.data.files[0], dlPath)
          }.bind(this)).then(function() {
            return this.getTorrents().then(function(torrents) {
              return torrents.filter(function(torrent) {
                return torrent.hash.toUpperCase() == infoHash
              })[0].hash
            })
          }.bind(this))
        },
        /**
             * Deluge supports setting the Download Path when adding magnets and .torrents.
             */
        isDownloadPathSupported: function() {
          return true
        },
        execute: function(method, args) {
          return this.rpc(method, args)
        }
      })

      return DelugeAPI
    }
  ])

  .factory('Deluge', ['BaseTorrentClient', 'DelugeRemote', 'DelugeAPI',
    function(BaseTorrentClient, DelugeRemote, DelugeAPI) {
      var Deluge = function() {
        BaseTorrentClient.call(this)
      }
      Deluge.extends(BaseTorrentClient, {})

      var service = new Deluge()
      service.setName('Deluge')
      service.setAPI(new DelugeAPI())
      service.setRemote(new DelugeRemote())
      service.setConfigMappings({
        server: 'deluge.server',
        port: 'deluge.port',
        password: 'deluge.password'
      })
      service.setEndpoints({
        rpc: '/json',
        upload: '/upload'
      })
      service.readConfig()

      return service
    }
  ])

  .run(['DuckieTorrent', 'Deluge', 'SettingsService',
    function(DuckieTorrent, Deluge, SettingsService) {
      if (SettingsService.get('torrenting.enabled')) {
        DuckieTorrent.register('Deluge', Deluge)
      }
    }
  ])
;
/**
 * qBittorrent
 *
 * API Docs:
 * https://github.com/qbittorrent/qBittorrent/wiki/WebUI-API-Documentation
 *
 * Works for both 3.2+ and below.
 *
 * - Does not support setting the download directory
 * - Does not support setting the label
 */
var qBittorrentData = function(data) {
  this.update(data)
}

qBittorrentData.extends(TorrentData, {
  getName: function() {
    return this.name
  },
  getDownloadSpeed: function() {
    if (typeof this.dlspeed === 'string') {
      // qBitTorrent < 3.2
      var rate = parseInt(this.dlspeed.split(' ')[0])
      var units = this.dlspeed.split(' ')[1]
      switch (units) {
        case 'KiB/s':
          rate = rate * 1024
          break
        case 'MiB/s':
          rate = rate * 1024 * 1024
          break
        case 'GiB/s':
          rate = rate * 1024 * 1024 * 1024
          break
        case 'B/s':
        default:
      }
    } else {
      // qBitTorrent 3.2+
      rate = this.dlspeed
    }
    return rate // Bytes/second
  },
  getProgress: function() {
    return this.round(this.progress * 100, 1)
  },
  start: function() {
    this.getClient().getAPI().execute('resume', this.hash)
  },
  stop: function() {
    this.pause()
  },
  pause: function() {
    this.getClient().getAPI().execute('pause', this.hash)
  },
  remove: function() {
    this.getClient().getAPI().remove(this.hash)
  },
  getFiles: function() {
    var self = this
    return this.getClient().getAPI().getFiles(this.hash).then(function(results) {
      self.files = results
      return results
    })
  },
  getDownloadDir: function() {
    return this.files.downloaddir
  },
  isStarted: function() {
    return ['downloading', 'uploading', 'stalledDL', 'stalledUP'].indexOf(this.state) > -1
  }
})

/**
 * qBittorrent < 3.2 client
 */
DuckieTorrent.factory('qBittorrentRemote', ['BaseTorrentRemote',
  function(BaseTorrentRemote) {
    var qBittorrentRemote = function() {
      BaseTorrentRemote.call(this)
      this.dataClass = qBittorrentData
    }
    qBittorrentRemote.extends(BaseTorrentRemote)

    return qBittorrentRemote
  }
])

  .factory('qBittorrentAPI', ['BaseHTTPApi', '$http', '$q',
    function(BaseHTTPApi, $http, $q) {
      var qBittorrentAPI = function() {
        BaseHTTPApi.call(this)
      }
      qBittorrentAPI.extends(BaseHTTPApi, {
        portscan: function() {
          return this.request('portscan').then(function(result) {
            return result !== undefined
          }, function() {
            return false
          })
        },
        getTorrents: function() {
          return this.request('torrents').then(function(data) {
            return data.data
          })
        },
        getFiles: function(hash) {
          var self = this
          return this.request('files', hash).then(function(data) {
            return self.request('general', hash).then(function(general) {
              data.data.downloaddir = (general.data.save_path) ? general.data.save_path.slice(0, -1) : undefined
              return data.data
            })
          })
        },
        addMagnet: function(magnetHash) {
          return $http.post(this.getUrl('addmagnet'), 'urls=' + encodeURIComponent(magnetHash), {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded'
            }
          })
        },
        remove: function(magnetHash) {
          return $http.post(this.getUrl('remove'), 'hashes=' + encodeURIComponent(magnetHash), {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded'
            }
          })
        },
        addTorrentByUrl: function(url, infoHash, releaseName) {
          var self = this
          return this.addMagnet(url).then(function(result) {
            var currentTry = 0
            var maxTries = 5
            // wait for qBittorrent to add the torrent to the list. we poll 5 times until we find it, otherwise abort.
            return $q(function(resolve, reject) {
              function verifyAdded() {
                currentTry++
                self.getTorrents().then(function(result) {
                  var hash = null
                  // for each torrent compare the torrent.hash with .torrent infoHash
                  result.map(function(torrent) {
                    if (torrent.hash.toUpperCase() == infoHash) {
                      hash = infoHash
                    }
                  })
                  if (hash !== null) {
                    resolve(hash)
                  } else {
                    if (currentTry < maxTries) {
                      setTimeout(verifyAdded, 1000)
                    } else {
                      throw 'Hash ' + infoHash + ' not found for torrent ' + releaseName + ' in ' + maxTries + ' tries.'
                    }
                  }
                })
              }
              setTimeout(verifyAdded, 1000)
            })
          })
        },
        addTorrentByUpload: function(data, infoHash, releaseName) {
          var self = this
          var headers = {
            'Content-Type': undefined
          }
          if (this.config.use_auth) {
            headers.Authorization = [this.config.username, this.config.password]
          }
          var fd = new FormData()
          fd.append('torrents', data, releaseName + '.torrent')

          return $http.post(this.getUrl('addfile'), fd, {
            transformRequest: angular.identity,
            headers: headers
          }).then(function(result) {
            var currentTry = 0
            var maxTries = 5
            // wait for qBittorrent to add the torrent to the list. we poll 5 times until we find it, otherwise abort.
            return $q(function(resolve, reject) {
              function verifyAdded() {
                currentTry++
                self.getTorrents().then(function(result) {
                  var hash = null
                  // for each torrent compare the torrent.hash with .torrent infoHash
                  result.map(function(torrent) {
                    if (torrent.hash.toUpperCase() == infoHash) {
                      hash = infoHash
                    }
                  })
                  if (hash !== null) {
                    resolve(hash)
                  } else {
                    if (currentTry < maxTries) {
                      setTimeout(verifyAdded, 1000)
                    } else {
                      throw 'Hash ' + infoHash + ' not found for torrent ' + releaseName + ' in ' + maxTries + ' tries.'
                    }
                  }
                })
              }
              setTimeout(verifyAdded, 1000)
            })
          })
        },
        execute: function(method, id) {
          return $http.post(this.getUrl(method), 'hash=' + id, {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded'
            }
          })
        }
      })
      return qBittorrentAPI
    }
  ])

  .factory('qBittorrent', ['BaseTorrentClient', 'qBittorrentRemote', 'qBittorrentAPI',
    function(BaseTorrentClient, qBittorrentRemote, qBittorrentAPI) {
      var qBittorrent = function() {
        BaseTorrentClient.call(this)
      }
      qBittorrent.extends(BaseTorrentClient, {})

      var service = new qBittorrent()
      service.setName('qBittorrent (pre3.2)')
      service.setAPI(new qBittorrentAPI())
      service.setRemote(new qBittorrentRemote())
      service.setConfigMappings({
        server: 'qbittorrent.server',
        port: 'qbittorrent.port',
        username: 'qbittorrent.username',
        password: 'qbittorrent.password',
        use_auth: 'qbittorrent.use_auth'
      })
      service.setEndpoints({
        torrents: '/json/torrents',
        portscan: '/json/transferInfo',
        addmagnet: '/command/download',
        addfile: '/command/upload',
        resume: '/command/resume',
        pause: '/command/pause',
        remove: '/command/delete',
        files: '/json/propertiesFiles/%s',
        general: '/json/propertiesGeneral/%s'
      })
      service.readConfig()

      return service
    }
  ])

  .run(['DuckieTorrent', 'qBittorrent', 'SettingsService',
    function(DuckieTorrent, qBittorrent, SettingsService) {
      if (SettingsService.get('torrenting.enabled')) {
        DuckieTorrent.register('qBittorrent (pre3.2)', qBittorrent)
      }
    }
  ])
;
/**
 * qBittorrent32plus >= 3.2 client
 *
 * API Docs:
 * https://github.com/qbittorrent/qBittorrent/wiki/WebUI-API-Documentation v3.2.0-v4.0.4 APIv1
 * https://github.com/qbittorrent/qBittorrent/wiki/Web-API-Documentation v4.1+ APIv2
 *
 * - Supports setting download directory (After qBittorrent v3.3.1, using APIv1 subversion 7+)
 * - Supports setting label (After qBittorrent v3.3.1, using APIv1 subversion 7+)
 */

DuckieTorrent.factory('qBittorrent32plusAPI', ['qBittorrentAPI', '$http', '$q',
  function(qBittorrentAPI, $http, $q) {
    var qBittorrent32plusAPI = function() {
      qBittorrentAPI.call(this)
      this.config.apiVersion = 1 // lets assume the API is v1 to begin with
      this.config.apiSubVersion = 0
    }
    qBittorrent32plusAPI.extends(qBittorrentAPI, {
      login: function() {
        var self = this
        var method = (self.config.apiVersion == 2) ? 'loginv2' : 'login'
        return $http.post(this.getUrl(method), 'username=' + encodeURIComponent(this.config.username) + '&password=' + encodeURIComponent(this.config.password), {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Forwarded-Host': window.location.origin
          }
        }).then(function(result) {
          if (result.data == 'Ok.') {
            if (window.debug982) console.debug('qBittorrent32plusAPI.login', result.data)
              if (self.config.apiVersion == 2) {
                return self.request('versionv2').then(function(result) {
                  var subs = result.data.split('.')
                  self.config.apiSubVersion = subs[1]
                  return true
                })
              }
            return true
          } else {
            if (window.debug982) console.debug('qBittorrent32plusAPI.login', result.data)
            throw 'Login failed!'
          }
        })
      },
      portscan: function() {
        var self = this
        if (self.config.apiVersion == 2) {
          // APIv2 requires a login before any other calls are made
          return self.login().then(function() {
            return true
          })
        } else {
          // APIv1 allows us to poll for port then login when found
          return this.request('version').then(function(result) {
            self.config.apiSubVersion = result.data
            return self.login().then(function() {
              return true
            })
          }, function(err) {
            if (err.status == 404) {
              // method not found? lets try APIv2
              self.config.apiVersion = 2
            }
            return false
          })
        }
      },
      addMagnet: function(magnetHash, dlPath, label) {
        var self = this
        var method = (self.config.apiVersion == 2) ? 'addmagnetv2' : 'addmagnet'
        if ((self.config.apiVersion == 2)  || ((self.config.apiVersion == 1) && (self.config.apiSubVersion > 6))) {
          // APIv2 or APIv1 sub > 6
          var fd = new FormData()
          fd.append('urls', magnetHash)
          if (dlPath !== undefined && dlPath !== null) {
            fd.append('savepath', dlPath)
          }
          if (label !== undefined && label !== null) {
            fd.append('category', label)
          }
          var headers = {
            'Content-Type': undefined,
            'X-Forwarded-Host': window.location.origin
          }
          return $http.post(this.getUrl(method), fd, {
            headers: headers
          }).then(function(result) {
            if (window.debug982) console.debug('qBittorrent32plusAPI.addmagnet', result.data)
          })
        } else {
          // APIv1 sub < 7
          var headers = {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
          return $http.post(this.getUrl(method), 'urls=' + encodeURIComponent(magnetHash), {
            headers: headers
          })
        }
      },
      addTorrentByUpload: function(data, infoHash, releaseName, dlPath, label) {
        var self = this
        var method = (self.config.apiVersion == 2) ? 'addfilev2' : 'addfile'
        var headers = {
          'Content-Type': undefined,
          'X-Forwarded-Host': window.location.origin
        }
        var fd = new FormData()
        fd.append('torrents', data, releaseName + '.torrent')

        if ((self.config.apiVersion == 2)  || ((self.config.apiVersion == 1) && (self.config.apiSubVersion > 6))) {
          // APIv2 or APIv1 sub > 6
          if (dlPath !== undefined && dlPath !== null) {
            fd.append('savepath', dlPath)
          }
          if (label !== undefined && label !== null) {
            fd.append('category', label)
          }
        }

        return $http.post(this.getUrl(method), fd, {
          transformRequest: angular.identity,
          headers: headers
        }).then(function(result) {
          if (window.debug982) console.debug('qBittorrent32plusAPI.addTorrentByUpload', result.data)
          var currentTry = 0
          var maxTries = 5
          // wait for qBittorrent to add the torrent to the list. we poll 5 times until we find it, otherwise abort.
          return $q(function(resolve, reject) {
            function verifyAdded() {
              currentTry++
              self.getTorrents().then(function(result) {
                var hash = null
                // for each torrent compare the torrent.hash with .torrent infoHash
                result.map(function(torrent) {
                  if (torrent.hash.toUpperCase() == infoHash) {
                    hash = infoHash
                  }
                })
                if (hash !== null) {
                  resolve(hash)
                } else {
                  if (currentTry < maxTries) {
                    setTimeout(verifyAdded, 1000)
                  } else {
                    throw 'Hash ' + infoHash + ' not found for torrent ' + releaseName + ' in ' + maxTries + ' tries.'
                  }
                }
              })
            }
            setTimeout(verifyAdded, 1000)
          })
        })
      },
      /**
       * qBittorrent APIv2 or APIv1 sub > 6 supports setting the Download Path when adding magnets and .torrents.
       */
      isDownloadPathSupported: function() {
        var self = this
        return ((self.config.apiVersion == 2)  || ((self.config.apiVersion == 1) && (self.config.apiSubVersion > 6)))
      },
      /**
       * qBittorrent APIv2 or APIv1 sub > 6 supports setting the Label when adding magnets and .torrents.
       */
      isLabelSupported: function() {
        var self = this
        return ((self.config.apiVersion == 2)  || ((self.config.apiVersion == 1) && (self.config.apiSubVersion > 6)))
      },
      remove: function(magnetHash) {
        var self = this
        if (self.config.apiVersion == 2) {
          var fd = new FormData()
          fd.append('hashes', magnetHash)
          fd.append('deleteFiles', false)
          var headers = {
            'Content-Type': undefined,
            'X-Forwarded-Host': window.location.origin
          }
          return $http.post(this.getUrl('removev2'), fd, {
            headers: headers
          }).then(function(result) {
            if (window.debug982) console.debug('qBittorrent32plusAPI.removev2', result.data)
          })
        } else {
          return $http.post(this.getUrl('remove'), 'hashes=' + encodeURIComponent(magnetHash), {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'X-Forwarded-Host': window.location.origin
            }
          })
        }
      },
      getTorrents: function() {
        var self = this
        var method = (self.config.apiVersion == 2) ? 'torrentsv2' : 'torrents'
        return this.request(method).then(function(data) {
          return data.data
        })
      },
      getFiles: function(hash) {
        var self = this
        var method = (self.config.apiVersion == 2) ? 'filesv2' : 'files'
        return this.request(method, hash).then(function(data) {
          var method = (self.config.apiVersion == 2) ? 'generalv2' : 'general'
          return self.request(method, hash).then(function(general) {
            data.data.downloaddir = (general.data.save_path) ? general.data.save_path.slice(0, -1) : undefined
            return data.data
          })
        })
      },
      execute: function(method, id) {
        var self = this
        var hashkey = 'hash='
        if (self.config.apiVersion == 2) {
          method = method + 'v2'
          hashkey = 'hashes='
        }
        var headers = {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Forwarded-Host': window.location.origin
        }
        return $http.post(this.getUrl(method), hashkey + id, {
          headers: headers
        })
      }
    })
    return qBittorrent32plusAPI
  }
])

  .factory('qBittorrent32plus', ['BaseTorrentClient', 'qBittorrentRemote', 'qBittorrent32plusAPI',
    function(BaseTorrentClient, qBittorrentRemote, qBittorrent32plusAPI) {
      var qBittorrent32plus = function() {
        BaseTorrentClient.call(this)
      }
      qBittorrent32plus.extends(BaseTorrentClient, {})

      var service = new qBittorrent32plus()
      service.setName('qBittorrent 3.2+')
      service.setAPI(new qBittorrent32plusAPI())
      service.setRemote(new qBittorrentRemote())
      service.setConfigMappings({
        server: 'qbittorrent32plus.server',
        port: 'qbittorrent32plus.port',
        username: 'qbittorrent32plus.username',
        password: 'qbittorrent32plus.password',
        use_auth: 'qbittorrent32plus.use_auth'
      })
      service.setEndpoints({
        torrents: '/query/torrents',
        torrentsv2: '/api/v2/torrents/info',
        addmagnet: '/command/download',
        addmagnetv2: '/api/v2/torrents/add',
        addfile: '/command/upload',
        addfilev2: '/api/v2/torrents/add',
        resume: '/command/resume',
        resumev2: '/api/v2/torrents/resume',
        pause: '/command/pause',
        pausev2: '/api/v2/torrents/pause',
        remove: '/command/delete',
        removev2: '/api/v2/torrents/delete',
        files: '/query/propertiesFiles/%s',
        filesv2: '/api/v2/torrents/files?hash=%s',
        general: '/query/propertiesGeneral/%s',
        generalv2: '/api/v2/torrents/properties?hash=%s',
        version: '/version/api',
        versionv2: '/api/v2/app/webapiVersion',
        login: '/login',
        loginv2: '/api/v2/auth/login'
      })
      service.readConfig()

      return service
    }
  ])

  .run(['DuckieTorrent', 'qBittorrent32plus', 'SettingsService',
    function(DuckieTorrent, qBittorrent32plus, SettingsService) {
      if (SettingsService.get('torrenting.enabled')) {
        DuckieTorrent.register('qBittorrent 3.2+', qBittorrent32plus)
      }
    }
  ])
;
/**
 * Ktorrent web client implementation
 *
 * API Docs:
 * None. reverse engineered from Ktorrent base implementation webui traffic
 * https://github.com/KDE/ktorrent
 *
 * XMLHTTP API listens on localhost:8080
 *
 * - Does not support setting or fetching the download directory
 * - Does not support setting or fetching a Label
 *
 * torrent data [array of torrent objects] containing:
 *   name: "Angie.Tribeca.S02E01.HDTV.x264-LOL[ettv]"
 *   bytes_downloaded: "19.47 MiB"               *   bytes_uploaded: "0 B"
 *   download_rate: "0 B/s"                      *   info_hash: "494bd308bd6688edb87bcd66a6b676dcd7e0ec30"
 *   leechers: "0"                               *   leechers_total: "6"
 *   num_files: "2"                              *   num_peers: "0"
 *   percentage: "11.83"                         *   running: "0"
 *   seeders: "0"                                *   seeders_total: "52"
 *   status: "Stopped"                           *   total_bytes: "120.22 MiB"
 *   total_bytes_to_download: "120.22 MiB"       *   upload_rate: "0 B/s"
 *
 * files data [array of file objects] containing:
 *   path: "Torrent-Downloaded-from-ExtraTorrent.cc.txt"
 *   percentage: "100.00"        *   priority: "40"      *   size: "168 B"
 */

/**
 *
 * KtorrentData is the main wrapper for a torrent info object coming from Ktorrent.
 * It extends the base TorrentData class.
 *
 */
var KtorrentData = function(data) {
  this.update(data)
}

KtorrentData.extends(TorrentData, {
  getName: function() {
    return this.name
  },
  getProgress: function() {
    return this.round(parseFloat(this.percentage), 1)
  },
  getDownloadSpeed: function() {
    var rate = parseInt(this.download_rate.split(' ')[0])
    var units = this.download_rate.split(' ')[1]
    switch (units) {
      case 'KiB/s':
        rate = rate * 1024
        break
      case 'MiB/s':
        rate = rate * 1024 * 1024
        break
      case 'GiB/s':
        rate = rate * 1024 * 1024 * 1024
        break
      case 'B/s':
      default:
    }
    return rate // Bytes/second
  },
  start: function() {
    return this.getClient().getAPI().execute('start=' + this.id)
  },
  stop: function() {
    return this.getClient().getAPI().execute('stop=' + this.id)
  },
  pause: function() {
    return this.stop()
  },
  remove: function() {
    var self = this
    return this.getClient().getAPI().execute('remove=' + this.id).then(function() {
      return self.getClient().getAPI().getTorrents()
    })
  },
  isStarted: function() {
    /*
        * 'downloading', 'stopped', 'not started', 'stalled', 'download completed', 'seeding',
        * 'superseeding', 'allocating diskspace', 'checking data', 'error', 'queued', 'seeding complete'
        */
    return ['stalled', 'downloading'].indexOf(this.status.toLowerCase()) !== -1
  },
  getFiles: function() {
    if (!this.files) {
      this.files = []
    }
    return this.getClient().getAPI().getFiles(this).then(function(data) {
      this.files = data
      return data
    }.bind(this))
  },
  getDownloadDir: function() {
    return undefined // not supported
  }
})

/**
 * Ktorrent remote singleton that receives the incoming data
 */
DuckieTorrent.factory('KtorrentRemote', ['BaseTorrentRemote',
  function(BaseTorrentRemote) {
    var KtorrentRemote = function() {
      BaseTorrentRemote.call(this)
      this.dataClass = KtorrentData
    }
    KtorrentRemote.extends(BaseTorrentRemote)

    return KtorrentRemote
  }
])

  .factory('KtorrentAPI', ['BaseHTTPApi', '$http', '$q',
    function(BaseHTTPApi, $http, $q) {
      var KtorrentAPI = function() {
        BaseHTTPApi.call(this)
      }
      KtorrentAPI.extends(BaseHTTPApi, {

        login: function(challenge) {
          var sha = hex_sha1(challenge + this.config.password)
          var fd = '&username=' + encodeURIComponent(this.config.username) + '&password=&Login=Sign+in&challenge=' + sha
          return $http.post(this.getUrl('login'), fd, {
            transformRequest: angular.identity,
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded'
            }
          }).then(function(result) {
            if (result.statusText == 'OK') {
              return true
            } else {
              throw 'Login failed!'
            }
          })
        },

        portscan: function() {
          var self = this
          return this.request('portscan').then(function(result) {
            var x2js = new X2JS()
            var jsonObj = x2js.xml2json((new DOMParser()).parseFromString(result.data, 'text/xml'))
            return self.login(jsonObj.challenge).then(function() {
              return true
            })
          }, function() {
            return false
          })
        },

        getTorrents: function() {
          return this.request('torrents', {}).then(function(result) {
            var x2js = new X2JS({arrayAccessForm: 'property'})
            var jsonObj = x2js.xml2json((new DOMParser()).parseFromString(result.data, 'text/xml'))
            if (jsonObj.torrents == '') { // no torrents found
              return []
            } else {
              return jsonObj.torrents.torrent_asArray.map(function(el, indx) {
                el.hash = el.info_hash.toUpperCase()
                el.id = indx
                return el
              })
            }
          })
        },

        getFiles: function(torrent) {
          return this.request('files', torrent.id).then(function(result) {
            var x2js = new X2JS({arrayAccessForm: 'property'})
            var jsonObj = x2js.xml2json((new DOMParser()).parseFromString(result.data, 'text/xml'))
            var files = []
            if (jsonObj.torrent == '') { // torrents with a single file don't have a file list?
              files.push({
                name: torrent.name,
                priority: '40',
                bytes: torrent.total_bytes,
                progress: torrent.percentage
              })
            } else {
              jsonObj.torrent.file_asArray.map(function(el) {
                files.push({
                  name: el.path,
                  priority: el.priority,
                  bytes: el.size,
                  progress: el.percentage
                })
              })
            }
            return files
          })
        },

        addMagnet: function(magnet) {
          return this.execute('load_torrent=' + encodeURIComponent(magnet))
        },

        addTorrentByUrl: function(url, infoHash, releaseName) {
          var self = this
          return this.addMagnet(url).then(function(result) {
            var currentTry = 0
            var maxTries = 5
            // wait for Ktorrent to add the torrent to the list. we poll 5 times until we find it, otherwise abort.
            return $q(function(resolve, reject) {
              function verifyAdded() {
                currentTry++
                self.getTorrents().then(function(result) {
                  var hash = null
                  // for each torrent compare the torrent.hash with .torrent infoHash
                  result.map(function(torrent) {
                    if (torrent.hash.toUpperCase() == infoHash) {
                      hash = infoHash
                    }
                  })
                  if (hash !== null) {
                    resolve(hash)
                  } else {
                    if (currentTry < maxTries) {
                      setTimeout(verifyAdded, 1000)
                    } else {
                      throw 'Hash ' + infoHash + ' not found for torrent ' + releaseName + ' in ' + maxTries + ' tries.'
                    }
                  }
                })
              }
              setTimeout(verifyAdded, 1000)
            })
          })
        },

        execute: function(cmd) {
          return $http.get(this.getUrl('torrentcontrol') + cmd).then(function(result) {
            var x2js = new X2JS()
            var jsonObj = x2js.xml2json((new DOMParser()).parseFromString(result.data, 'text/xml'))
            if (jsonObj.result == 'Failed') {
              console.warn('Error: action "' + cmd + '" failed.')
            }
          })
        }

      })

      return KtorrentAPI
    }
  ])

  .factory('Ktorrent', ['BaseTorrentClient', 'KtorrentRemote', 'KtorrentAPI',
    function(BaseTorrentClient, KtorrentRemote, KtorrentAPI) {
      var Ktorrent = function() {
        BaseTorrentClient.call(this)
      }
      Ktorrent.extends(BaseTorrentClient)

      var service = new Ktorrent()

      service.setName('Ktorrent')
      service.setAPI(new KtorrentAPI())
      service.setRemote(new KtorrentRemote())
      service.setConfigMappings({
        server: 'ktorrent.server',
        port: 'ktorrent.port',
        username: 'ktorrent.username',
        password: 'ktorrent.password'
      })
      service.setEndpoints({
        torrents: '/data/torrents.xml',
        login: '/login?page=interface.html',
        portscan: '/login/challenge.xml',
        torrentcontrol: '/action?', // [start=, stop=, remove=, load_torrent=]
        files: '/data/torrent/files.xml?torrent=%s'
      })
      service.readConfig()

      return service
    }
  ])

  .run(['DuckieTorrent', 'Ktorrent', 'SettingsService',
    function(DuckieTorrent, Ktorrent, SettingsService) {
      if (SettingsService.get('torrenting.enabled')) {
        DuckieTorrent.register('Ktorrent', Ktorrent)
      }
    }
  ])
;
/**
 * rTorrent
 *
 * API Docs:
 * https://github.com/rakshasa/rtorrent/wiki/RPC-Setup-XMLRPC
 * https://github.com/rakshasa/rtorrent/wiki/rTorrent-0.9-Comprehensive-Command-list-(WIP)
 *
 * - Supports setting download directory
 * - Does not supports setting a Label
 */
var rTorrentData = function(data) {
  this.update(data)
}

PromiseFileReader = function() {
  this.readAsDataURL = function(blob) {
    return new Promise(function(resolve, reject) {
      var reader = new FileReader()
      reader.onload = function(e) {
        resolve(e.target.result)
      }
      reader.onerror = function(e) {
        reject(e)
      }
      reader.readAsDataURL(blob)
    })
  }

  return this
}

rTorrentData.extends(TorrentData, {
  getName: function() {
    return this.name
  },
  getProgress: function() {
    return this.round(this.bytes_done / this.size_bytes * 100, 1)
  },
  getDownloadSpeed: function() {
    return this.down_rate // Bytes/second
  },
  start: function() {
    this.getClient().getAPI().execute('d.start', this.hash)
  },
  stop: function() {
    this.getClient().getAPI().execute('d.stop', this.hash)
  },
  pause: function() {
    this.getClient().getAPI().execute('d.pause', this.hash)
  },
  remove: function() {
    this.getClient().getAPI().execute('d.erase', this.hash)
  },
  isStarted: function() {
    return this.state > 0
  },
  /**
     * Impossible without parsing the .torrent???
     */
  getFiles: function() {
    var self = this
    return new Promise(function(resolve) {
      resolve([{name: self.base_filename}])
    })
  },
  getDownloadDir: function() {
    return this.directory_base
  }
})

DuckieTorrent.factory('rTorrentRemote', ['BaseTorrentRemote',
  function(BaseTorrentRemote) {
    var rTorrentRemote = function() {
      BaseTorrentRemote.call(this)
      this.dataClass = rTorrentData
    }
    rTorrentRemote.extends(BaseTorrentRemote)

    return rTorrentRemote
  }
])

  .factory('rTorrentAPI', ['BaseHTTPApi', 'xmlrpc', '$q',
    function(BaseHTTPApi, xmlrpc, $q) {
      var rTorrentAPI = function() {
        BaseHTTPApi.call(this)
      }
      rTorrentAPI.extends(BaseHTTPApi, {

        rpc: function(method, params, options) {
          xmlrpc.config({
            hostName: this.config.server + ':' + this.config.port, // Default is empty
            pathName: this.config.path, // Default is /RPC2
            401: function() {
              console.warn('You shall not pass !')
            },
            404: function() {
              console.info('API not found')
            },
            500: function() {
              console.error('Something went wrong :(')
            }
          })

          return xmlrpc.callMethod(method, params).then(function(result) {
            return result
          })
        },
        portscan: function() {
          return this.rpc('system.api_version').then(function(result) {
            return result !== undefined
          }, function() {
            return false
          })
        },
        getTorrents: function() {
          var self = this
          return this.rpc('download_list').then(function(data) {
            var args = []
            var indexMap = {}
            var props = ['d.base_filename', 'd.base_path', 'd.bytes_done', 'd.completed_bytes', 'd.directory', 'd.directory_base', 'd.down.rate', 'd.down.total', 'd.hash', 'd.name', 'd.size_bytes', 'd.state', 'd.up.rate']

            data.map(function(hash) {
              indexMap[hash] = {}
              props.map(function(prop) {
                propTransformer(prop, hash)
              })
            })

            function propTransformer(prop, hash) {
              var idx = args.push({ 'methodName': prop, 'params': [hash] })
              indexMap[hash][prop] = idx - 1
            }

            return self.rpc('system.multicall', [args]).then(function(result) {
              var output = []
              Object.keys(indexMap).map(function(hash) {
                var torrent = { hash: hash }
                Object.keys(indexMap[hash]).map(function(property) {
                  torrent[property.replace('d.', '').replace('.rate', '_rate')] = result[indexMap[hash][property]][0]
                })
                output.push(torrent)
              })
              return output
            })
            /*
    {"key":"hash","rt":"d.hash="},
    {"key":"state","rt":"d.state="},
    {"key":"name","rt":"d.name="},
    {"key":"size_bytes","rt":"d.size_bytes="},
    {"key":"up_total","rt":"d.up.total="},
    {"key":"ratio","rt":"d.ratio="},
    {"key":"up_rate","rt":"d.up.rate="},
    {"key":"down_rate","rt":"d.down.rate="},
    {"key":"peers","rt":"d.peers_accounted="},
    {"key":"base_path","rt":"d.base_path="},
    {"key":"date","rt":"d.creation_date="},
    {"key":"active","rt":"d.is_active="},
    {"key":"complete","rt":"d.complete="},
    {"key":"downsize","rt":"d.down.total="},
    {"key":"directory","rt":"d.directory="},
    {"key":"skipsize","rt":"d.skip.total="}
    */
            return data.arguments.torrents.map(function(el) {
              el.hash = el.hashString.toUpperCase()
              return el
            })
          })
        },
        addMagnet: function(magnet, dlPath) {
          if (dlPath !== undefined && dlPath !== null) {
            // using custom download directory
            var parms = ["", magnet, 'd.directory_base.set="' + dlPath + '"']
          } else {
            // using default download directory
            var parms = ["", magnet]
          }
          return this.rpc('load.start', parms)
        },
        addTorrentByUrl: function(url, infoHash, releaseName, dlPath) {
          var self = this
          return this.addMagnet(url, dlPath).then(function(result) {
            var currentTry = 0
            var maxTries = 5
            // wait for rTorrent to add the torrent to the list. we poll 5 times until we find it, otherwise abort.
            return $q(function(resolve, reject) {
              function verifyAdded() {
                currentTry++
                self.getTorrents().then(function(result) {
                  var hash = null
                  // for each torrent compare the torrent.hash with .torrent infoHash
                  result.map(function(torrent) {
                    if (torrent.hash.toUpperCase() == infoHash) {
                      hash = infoHash
                    }
                  })
                  if (hash !== null) {
                    resolve(hash)
                  } else {
                    if (currentTry < maxTries) {
                      setTimeout(verifyAdded, 1000)
                    } else {
                      throw 'Hash ' + infoHash + ' not found for torrent ' + releaseName + ' in ' + maxTries + ' tries.'
                    }
                  }
                })
              }
              setTimeout(verifyAdded, 1000)
            })
          })
        },
        addTorrentByUpload: function(data, infoHash, releaseName, dlPath) {
          var self = this
          return new PromiseFileReader().readAsDataURL(data).then(function(contents) {
            var key = 'base64,'

            var index = contents.indexOf(key)
            if (index > -1) {
              var value = new base64_xmlrpc_value(contents.substring(index + key.length))
              if (dlPath !== undefined && dlPath !== null) {
                // using custom download directory
                var parms = ["", value, 'd.directory_base.set="' + dlPath + '"']
              } else {
                // using default download directory
                var parms = ["", value]
              }
              return self.rpc('load.raw_start', parms).then(function(result) {
                var currentTry = 0
                var maxTries = 5
                // wait for rTorrent to add the torrent to the list. we poll 5 times until we find it, otherwise abort.
                return $q(function(resolve, reject) {
                  function verifyAdded() {
                    currentTry++
                    self.getTorrents().then(function(result) {
                      var hash = null
                      // for each torrent compare the torrent.hash with .torrent infoHash
                      result.map(function(torrent) {
                        if (torrent.hash.toUpperCase() == infoHash) {
                          hash = infoHash
                        }
                      })
                      if (hash !== null) {
                        resolve(hash)
                      } else {
                        if (currentTry < maxTries) {
                          setTimeout(verifyAdded, 1000)
                        } else {
                          throw 'Hash ' + infoHash + ' not found for torrent ' + releaseName + ' in ' + maxTries + ' tries.'
                        }
                      }
                    })
                  }
                  setTimeout(verifyAdded, 1000)
                })
              })
            }
          })
        },
        /**
             * rTorrent supports setting the Download Path when adding magnets and .torrents.
             */
        isDownloadPathSupported: function() {
          return true
        },
        execute: function(method, id) {
          return this.rpc(method, [id])
        }
      })

      return rTorrentAPI
    }
  ])

  .factory('rTorrent', ['BaseTorrentClient', 'rTorrentRemote', 'rTorrentAPI',
    function(BaseTorrentClient, rTorrentRemote, rTorrentAPI) {
      var rTorrent = function() {
        BaseTorrentClient.call(this)
      }
      rTorrent.extends(BaseTorrentClient, {})

      var service = new rTorrent()
      service.setName('rTorrent')
      service.setAPI(new rTorrentAPI())
      service.setRemote(new rTorrentRemote())
      service.setConfigMappings({
        server: 'rtorrent.server',
        port: 'rtorrent.port',
        path: 'rtorrent.path'
      })
      service.readConfig()

      return service
    }
  ])

  .run(['DuckieTorrent', 'rTorrent', 'SettingsService',
    function(DuckieTorrent, rTorrent, SettingsService) {
      if (SettingsService.get('torrenting.enabled')) {
        DuckieTorrent.register('rTorrent', rTorrent)
      }
    }
  ]);
/**
 * Tixati web client implementation minimum version 2.86
 *
 * API Docs:
 * None. reverse engineered from Tixati base implementation
 *      go to settings-->user interface-->webui and turn on the webUI
 *      then at the bottom in the 'HTML Templates' section click 'select a folder' and choose a folder that you want the templates to go into.
 *      then click 'create examples'
 *      in the folder you selected there should be example templates.
 *
 * HTTP API listens on localhost:8888
 *
 * Setup:
 * Enable web interface in Tixati options, set a username and password.
 * Make sure to use the default skin
 *
 * - Does not support setting or fetching the download directory
 * - Does not support setting or fetching Labels
 */

/**
 *
 * TixatiData is the main wrapper for a torrent info object coming from Tixati.
 * It extends the base TorrentData class.
 *
 */
var TixatiData = function(data) {
  this.update(data)
}

TixatiData.extends(TorrentData, {
  getName: function() {
    return this.name
  },
  getProgress: function() {
    return this.progress
  },
  getDownloadSpeed: function() {
    return this.downSpeed // kB/s (actually governed by Tixati settings: user interface, output formatting, bytes, largest unit. default is k.)
  },
  start: function() {
    var fd = new FormData()
    fd.append('start', 'Start')
    return this.getClient().getAPI().execute(this.guid, fd)
  },
  stop: function() {
    var fd = new FormData()
    fd.append('stop', 'Stop')
    return this.getClient().getAPI().execute(this.guid, fd)
  },
  pause: function() {
    return this.stop()
  },
  remove: function() {
    var self = this
    var fd = new FormData()
    fd.append('removeconf', 'Remove Transfers')
    fd.append('remove', 'Remove')
    return this.getClient().getAPI().execute(this.guid, fd)
  },
  isStarted: function() {
    return this.status.toLowerCase().indexOf('offline') == -1
  },
  getFiles: function() {
    if (!this.files) {
      this.files = []
    }
    return this.getClient().getAPI().getFiles(this.guid).then(function(data) {
      this.files = data
      return data
    }.bind(this))
  },
  getDownloadDir: function() {
    return undefined // not supported
  }
})

/**
 * Tixati remote singleton that receives the incoming data
 */
DuckieTorrent.factory('TixatiRemote', ['BaseTorrentRemote',
  function(BaseTorrentRemote) {
    var TixatiRemote = function() {
      BaseTorrentRemote.call(this)
      this.dataClass = TixatiData
    }
    TixatiRemote.extends(BaseTorrentRemote)

    return TixatiRemote
  }
])

  .factory('TixatiAPI', ['BaseHTTPApi', '$http', '$q',
    function(BaseHTTPApi, $http, $q) {
      var TixatiAPI = function() {
        this.infohashCache = {}
        BaseHTTPApi.call(this)
      }

      TixatiAPI.extends(BaseHTTPApi, {
        portscan: function() {
          var headers = {
            'Content-Type': 'text/html',
            'charset': 'utf-8'
          }
          if (this.config.use_auth) {
            headers.Authorization = [this.config.username, this.config.password]
          }
          return this.request('portscan', {headers: headers}).then(function(result) {
            var scraper = new HTMLScraper(result.data)

            var categories = {}

            var categoriesList = []

            scraper.walkSelector('.homestats tr:first-child th', function(node) {
              categoriesList.push(node.innerText)
              categories[node.innerText] = {}
            })

            scraper.walkSelector('.homestats tr:not(:first-child)', function(node) {
              scraper.walkNodes(node.querySelectorAll('td'), function(cell, idx) {
                var cat = cell.innerText.split('  ')
                categories[categoriesList[idx]][cat[0]] = cat[1]
              })
            })

            return categories
          }, function() {
            return false
          })
        },

        getTorrents: function() {
          var self = this
          var headers = {
            'Content-Type': 'text/html',
            'charset': 'utf-8'
          }
          if (this.config.use_auth) {
            headers.Authorization = [this.config.username, this.config.password]
          }
          return this.request('torrents', {headers: headers}).then(function(result) {
            var scraper = new HTMLScraper(result.data)

            var torrents = []

            scraper.walkSelector('.xferslist > tbody > tr', function(node) {
              var tds = node.querySelectorAll('td')
              var torrent = new TixatiData({
                name: tds[1].innerText,
                bytes: tds[2].innerText,
                progress: parseInt(tds[3].innerText),
                status: tds[4].innerText,
                downSpeed: parseInt(tds[5].innerText == '' ? '0' : tds[5].innerText.replace(',', '')) * 1000,
                upSpeed: parseInt(tds[6].innerText == '' ? '0' : tds[6].innerText.replace(',', '')) * 1000,
                priority: tds[7].innerText,
                eta: tds[8].innerText,
                guid: tds[1].querySelector('div.listcell').querySelector('a').getAttribute('href').match(/\/transfers\/([a-z-A-Z0-9]+)\/details/)[1]
              })
              if ((torrent.guid in self.infohashCache)) {
                torrent.hash = self.infohashCache[torrent.guid]
                torrents.push(torrent)
              } else {
                self.getInfoHash(torrent.guid).then(function(result) {
                  torrent.hash = self.infohashCache[torrent.guid] = result
                  torrents.push(torrent)
                })
              }
            })
            return torrents
          })
        },

        getInfoHash: function(guid) {
          return this.request('infohash', guid).then(function(result) {
            var magnet = result.data.match(/([0-9ABCDEFabcdef]{40})/)
            if (magnet && magnet.length) {
              return magnet[0].toUpperCase()
            }
          })
        },

        getFiles: function(guid) {
          return this.request('files', guid).then(function(result) {
            var scraper = new HTMLScraper(result.data)
            var files = []

            scraper.walkSelector('.listtable > tbody > tr', function(node) {
              var cells = node.querySelectorAll('td')
              files.push({
                name: cells[1].innerText.trim(),
                priority: cells[2].innerText.trim(),
                bytes: cells[3].innerText.trim(),
                progress: cells[4].innerText.trim()
              })
            })
            return files
          })
        },

        addMagnet: function(magnet) {
          var fd = new FormData()
          fd.append('addlinktext', magnet)
          fd.append('addlink', 'Add')
          var headers = {
            'Content-Type': undefined,
            'charset': 'utf-8'
          }
          if (this.config.use_auth) {
            headers.Authorization = [this.config.username, this.config.password]
          }

          return $http.post(this.getUrl('addmagnet'), fd, {
            transformRequest: angular.identity,
            headers: headers
          })
        },

        addTorrentByUpload: function(data, infoHash, releaseName) {
          var self = this

          var fd = new FormData()

          fd.append('metafile', data, releaseName + '.torrent')
          fd.append('addmetafile', 'Add')
          var headers = {
            'Content-Type': undefined,
            'charset': 'utf-8'
          }
          if (this.config.use_auth) {
            headers.Authorization = [this.config.username, this.config.password]
          }

          return $http.post(this.getUrl('addmagnet'), fd, {
            transformRequest: angular.identity,
            headers: headers
          }).then(function(result) {
            var currentTry = 0
            var maxTries = 5
            // wait for Tixati to add the torrent to the list. we poll 5 times until we find it, otherwise abort.
            return $q(function(resolve, reject) {
              function verifyAdded() {
                currentTry++
                self.getTorrents().then(function(result) {
                  var hash = null
                  // for each torrent compare the torrent.hash with .torrent infoHash
                  result.map(function(torrent) {
                    if (torrent.hash.toUpperCase() == infoHash) {
                      hash = infoHash
                    }
                  })
                  if (hash !== null) {
                    resolve(hash)
                  } else {
                    if (currentTry < maxTries) {
                      setTimeout(verifyAdded, 1000)
                    } else {
                      throw 'Hash ' + infoHash + ' not found for torrent ' + releaseName + ' in ' + maxTries + ' tries.'
                    }
                  }
                })
              }
              setTimeout(verifyAdded, 1000)
            })
          })
        },

        execute: function(guid, formData) {
          var headers = {
            'Content-Type': undefined,
            'charset': 'utf-8'
          }
          if (this.config.use_auth) {
            headers.Authorization = [this.config.username, this.config.password]
          }
          return $http.post(this.getUrl('torrentcontrol', guid), formData, {
            transformRequest: angular.identity,
            headers: headers
          })
        }

      })

      return TixatiAPI
    }
  ])

  .factory('Tixati', ['BaseTorrentClient', 'TixatiRemote', 'TixatiAPI',
    function(BaseTorrentClient, TixatiRemote, TixatiAPI) {
      var Tixati = function() {
        BaseTorrentClient.call(this)
      }
      Tixati.extends(BaseTorrentClient)

      var service = new Tixati()

      service.setName('Tixati')
      service.setAPI(new TixatiAPI())
      service.setRemote(new TixatiRemote())
      service.setConfigMappings({
        server: 'tixati.server',
        port: 'tixati.port',
        use_auth: 'tixati.use_auth',
        username: 'tixati.username',
        password: 'tixati.password'
      })
      service.setEndpoints({
        torrents: '/transfers',
        portscan: '/home',
        infohash: '/transfers/%s/eventlog',
        torrentcontrol: '/transfers/%s/options/action', // POST [start, stop, remove, searchdht, checkfiles, delete]
        addmagnet: '/transfers/action',
        files: '/transfers/%s/files'
      })
      service.readConfig()

      return service
    }
  ])

  .run(['DuckieTorrent', 'Tixati', 'SettingsService',
    function(DuckieTorrent, Tixati, SettingsService) {
      if (SettingsService.get('torrenting.enabled')) {
        DuckieTorrent.register('Tixati', Tixati)
      }
    }
  ])
;
/**
 * Transmission
 *
 * API Docs:
 * https://trac.transmissionbt.com/browser/trunk/extras/rpc-spec.txt
 *
 * - Supports setting download directory
 * - Does not supports setting a Label
 */
var TransmissionData = function(data) {
  this.update(data)
}

var PromiseFileReader = function() {
  this.readAsDataURL = function(blob) {
    return new Promise(function(resolve, reject) {
      var reader = new FileReader()
      reader.onload = function(e) {
        resolve(e.target.result)
      }
      reader.onerror = function(e) {
        reject(e)
      }
      reader.readAsDataURL(blob)
    })
  }

  return this
}

TransmissionData.extends(TorrentData, {
  getName: function() {
    return this.name
  },
  getProgress: function() {
    var unit = (this.getClient().getAPI().config.progressX100) ? 100 : 1
    return this.round(this.percentDone * unit, 1)
  },
  getDownloadSpeed: function() {
    return this.rateDownload // Bytes/second
  },
  start: function() {
    this.getClient().getAPI().execute('torrent-start', this.id)
  },
  stop: function() {
    this.getClient().getAPI().execute('torrent-stop', this.id)
  },
  pause: function() {
    this.stop()
  },
  remove: function() {
    this.getClient().getAPI().execute('torrent-remove', this.id)
  },
  isStarted: function() {
    return this.status > 0
  },
  getFiles: function() {
    var self = this
    return new Promise(function(resolve) {
      resolve(self.files)
    })
  },
  getDownloadDir: function() {
    return this.downloadDir
  }
})

DuckieTorrent.factory('TransmissionRemote', ['BaseTorrentRemote',
  function(BaseTorrentRemote) {
    var TransmissionRemote = function() {
      BaseTorrentRemote.call(this)
      this.dataClass = TransmissionData
    }
    TransmissionRemote.extends(BaseTorrentRemote)

    return TransmissionRemote
  }
])

  .factory('TransmissionAPI', ['BaseHTTPApi', '$http',
    function(BaseHTTPApi, $http) {
      var TransmissionAPI = function() {
        BaseHTTPApi.call(this)
        this.sessionID = null
      }
      TransmissionAPI.extends(BaseHTTPApi, {

        getUrl: function(type, param) {
          var out = this.config.server + ':' + this.config.port + this.config.path
          return (param) ? out.replace('%s', encodeURIComponent(param)) : out
        },
        rpc: function(method, params, options) {
          var self = this

          var request = {
            'method': method
          }

          var headers = {
            'X-Transmission-Session-Id': self.sessionID
          }

          for (var i in params) {
            request[i] = params[i]
          }

          if (this.config.use_auth) {
            headers.Authorization = [this.config.username, this.config.password]
          }
          return $http.post(this.getUrl('rpc'), request, {
            headers: headers
          }).then(function(response) {
            return response.data
          }, function(e, f) {
            self.sessionID = e.headers('X-Transmission-Session-Id')
            if (e.status === 409) {
              return self.rpc(method, request, options)
            }
          })
        },
        portscan: function() {
          var self = this
          return this.rpc('session-get').then(function(result) {
            return result !== undefined
          }, function() {
            return false
          })
        },
        getTorrents: function() {
          return this.rpc('torrent-get', {
            arguments: {
              'fields': ['id', 'name', 'hashString', 'status', 'error', 'errorString', 'eta', 'isFinished', 'isStalled', 'leftUntilDone', 'metadataPercentComplete', 'percentDone', 'sizeWhenDone', 'files', 'rateDownload', 'rateUpload', 'downloadDir']
            }
          }).then(function(data) {
            return data.arguments.torrents.map(function(el) {
              el.hash = el.hashString.toUpperCase()
              return el
            })
          })
        },
        addMagnet: function(magnetHash, dlPath) {
          if (dlPath !== undefined && dlPath !== null) {
            // using download path
            var parms = {
              paused: false,
              filename: magnetHash,
              'download-dir': dlPath
            }
          } else {
            // without download path
            var parms = {
              paused: false,
              filename: magnetHash
            }
          }
          return this.rpc('torrent-add', {
            arguments: parms
          })
        },
        addTorrentByUrl: function(url, infoHash, releaseName, dlPath) {
          return this.addMagnet(url, dlPath).then(function(result) {
            return result.arguments['torrent-added'].hashString.toUpperCase()
          })
        },
        addTorrentByUpload: function(data, infoHash, releaseName, dlPath) {
          var self = this
          return new PromiseFileReader().readAsDataURL(data).then(function(contents) {
            var key = 'base64,'

            var index = contents.indexOf(key)
            if (index > -1) {
              if (dlPath !== undefined && dlPath !== null) {
                // using download path
                var parms = {
                  paused: false,
                  metainfo: contents.substring(index + key.length),
                  'download-dir': dlPath
                }
              } else {
                // without download path
                var parms = {
                  paused: false,
                  metainfo: contents.substring(index + key.length)
                }
              }
              return self.rpc('torrent-add', {
                arguments: parms
              }).then(function(result) {
                return result.arguments['torrent-added'].hashString.toUpperCase()
              })
            }
          })
        },
        /**
             * Transmission supports setting the Download Path when adding magnets and .torrents.
             */
        isDownloadPathSupported: function() {
          return true
        },
        execute: function(method, id) {
          return this.rpc(method, {
            'arguments': {
              ids: [id]
            }
          })
        }
      })

      return TransmissionAPI
    }
  ])

  .factory('Transmission', ['BaseTorrentClient', 'TransmissionRemote', 'TransmissionAPI',
    function(BaseTorrentClient, TransmissionRemote, TransmissionAPI) {
      var Transmission = function() {
        BaseTorrentClient.call(this)
      }
      Transmission.extends(BaseTorrentClient, {})

      var service = new Transmission()
      service.setName('Transmission')
      service.setAPI(new TransmissionAPI())
      service.setRemote(new TransmissionRemote())
      service.setConfigMappings({
        server: 'transmission.server',
        port: 'transmission.port',
        path: 'transmission.path',
        username: 'transmission.username',
        password: 'transmission.password',
        use_auth: 'transmission.use_auth',
        progressX100: 'transmission.progressX100'
      })
      service.readConfig()

      return service
    }
  ])

  .run(['DuckieTorrent', 'Transmission', 'SettingsService',
    function(DuckieTorrent, Transmission, SettingsService) {
      if (SettingsService.get('torrenting.enabled')) {
        DuckieTorrent.register('Transmission', Transmission)
      }
    }
  ])
;
/**
 * tTorrent (Android bitTorrent) https://ttorrent.org/
 *
 * API Docs:
 * none that I could find so far. The WEB UI has been divined by examining the Network traffic
 *
 * - Does not support setting download directory
 * - Does not support setting a Label
 */
var tTorrentData = function(data) {
  this.update(data)
}

tTorrentData.extends(TorrentData, {
  getName: function() {
    return this.name
  },
  getProgress: function() {
    return this.progress
  },
  getDownloadSpeed: function() {
    return this.downSpeed // Bytes/second
  },
  start: function() {
    this.getClient().getAPI().execute('start', this.hash)
  },
  pause: function() {
    this.getClient().getAPI().execute('pause', this.hash)
  },
  stop: function() {
    return this.pause()
  },
  remove: function() {
    this.getClient().getAPI().execute('remove', this.hash)
  },
  getFiles: function() {
    return this.getClient().getAPI().getFiles(this.hash).then(function(results) {
      // since files is not supported by tTorrent's webui, lets return the Size and ETA instead.
      results = [{name: ['Files: n/a | TotalSize:', this.size, '| ETA:', this.eta].join(' ')}]
      this.files = results
      return results
    }.bind(this))
  },
  getDownloadDir: function() {
    return undefined // not supported
  },
  isStarted: function() {
    return ['downloading', 'seeding'].indexOf(this.status.toLowerCase()) > -1
  }
})

/**
 * tTorrent
 */
DuckieTorrent.factory('tTorrentRemote', ['BaseTorrentRemote',
  function(BaseTorrentRemote) {
    var tTorrentRemote = function() {
      BaseTorrentRemote.call(this)
      this.dataClass = tTorrentData
    }
    tTorrentRemote.extends(BaseTorrentRemote)

    return tTorrentRemote
  }
])

  .factory('tTorrentAPI', ['BaseHTTPApi', '$http', '$q',
    function(BaseHTTPApi, $http, $q) {
      var tTorrentAPI = function() {
        BaseHTTPApi.call(this)
        this.config.token = ''
      }
      tTorrentAPI.extends(BaseHTTPApi, {
        /**
             * Fetches the URL, auto-replaces the port in the URL if it was found.
             */
        getUrl: function(type, param) {
          var out = this.config.server + ':' + this.config.port + this.endpoints[type]
          return (param) ? out.replace('%s', encodeURIComponent(param)) : out
        },
        portscan: function() {
          var headers = {
            'Content-Type': 'text/html',
            'charset': 'utf-8'
          }
          if (this.config.use_auth) {
            headers.Authorization = [this.config.username, this.config.password]
          }
          return this.request('portscan', {headers: headers}).then(function(result) {
            var scraper = new HTMLScraper(result.data)
            if (scraper.querySelector('.header').innerText.trim() !== 'tTorrent web interface') {
              console.warn('webui not found', result)
              return false
            }
            return true
          }, function() {
            return false
          })
        },
        getTorrents: function() {
          var self = this
          var headers = {
            'Content-Type': 'text/html',
            'charset': 'utf-8'
          }
          if (this.config.use_auth) {
            headers.Authorization = [this.config.username, this.config.password]
          }
          return this.request('torrents', {headers: headers}).then(function(result) {
            var scraper = new HTMLScraper(result.data)
            var torrents = []
            function convertRate(rateString) {
              var rate = parseInt(rateString.split(' ')[0])
              var units = rateString.split(' ')[1]
              switch (units) {
                case 'kB/s':
                  rate = rate * 1000
                  break
                case 'MB/s':
                  rate = rate * 1000 * 1000
                  break
                case 'GB/s':
                  rate = rate * 1000 * 1000 * 1000
                  break
                case 'B/s':
                  break
                default:
                  console.warn('unexpected rate units ', units)
              }
              return rate // Bytes/second
            }
            scraper.walkSelector('.torrent', function(torrentNode) {
              var torrentName = torrentNode.querySelector('.torrentTitle').innerText.trim()
              // <form action="/cmd/remove/bd5143fcf96b4e11c61c1748f2173a722378fa97" method="post" class="inlineForm">
              var torrentHash = torrentNode.querySelector('.inlineForm').action.match(/\/cmd\/remove\/([0-9ABCDEFabcdef]{40})/)[1]
              var torrentDetails = torrentNode.querySelector('.torrentDetails')
              // <div class="progress" style="width:   0%;">
              var torrentProgress = parseInt(torrentDetails.querySelector('.progress').style.cssText.split(':')[1].trim(), 10) // 26%
              // Downloading metadata - 0.0% | Downloading - Paused | Downloading - 25.9% | Seeding - 100.0% | Seeding - Paused | Checking resume data - 0.0%
              var torrentStatus = torrentDetails.querySelector('div:nth-of-type(2)').innerHTML.replace(/<\/div>/g, '').split('<div>')[0].trim()
              if (torrentStatus.indexOf('Downloading') > -1 && torrentStatus.indexOf('%') > -1) {
                // if downloading is active, use this float for better accuracy instead
                torrentProgress = parseFloat(torrentStatus.replace('Downloading - ', '')) // 25.9%
              }
              if (torrentStatus.indexOf('Downloading') == -1 && torrentStatus.indexOf('Seeding') == -1 && torrentStatus.indexOf('Checking') == -1) {
                console.warn('unexpected status', torrentStatus)
                torrentStatus = 'Unknown'
              }
              if (torrentStatus.indexOf('Downloading - Paused') > -1) { // drop 'Downloading -'
                torrentStatus = 'Paused'
              }
              if (torrentStatus.indexOf('metadata') > -1) { // drop 'Downloading - n.n%'
                torrentStatus = 'Metadata'
              }
              if (torrentStatus.indexOf('resume data') > -1) { // drop 'resume data - n.n%'
                torrentStatus = 'Checking'
              }
              if (torrentStatus.indexOf('Downloading') > -1) { // drop '- n.n%'
                torrentStatus = 'Downloading'
              }
              if (torrentStatus.indexOf('Seeding') > -1) { // drop '- 100.0%'
                torrentStatus = 'Seeding'
              }
              // (downloading) <div>Peers: 105/512 | Ratio: 0.000   Size: 564.4 MB   Uploaded: 0 B | ETA: 4m 55s | Up: 0 B/s   Down: 0 B/s</div>
              // (seeding) <div>Peers: 9/27 | Ratio: 0.000   Size: 121.4 MB   Uploaded: 0 B | Finished: 5 min. ago | Up: 0 B/s   Down: 0 B/s</div>
              // one or more fields can be missing!!
              var torrentData = torrentDetails.querySelector('div:nth-of-type(2)').innerHTML.replace(/<\/div>/g, '').split('<div>')[1].replace(/\|/g, ' ').split('   ')
              var torrentSize = '0 B'
              var torrentUpSpeed; var torrentDownSpeed = '0 B/s'
              var torrentETA = 'n/a'
              torrentData.map(function(data) {
                if (data.indexOf('Size:') > -1) {
                  torrentSize = data.split(':')[1].trim()
                }
                if (data.indexOf('ETA:') > -1) {
                  torrentETA = data.split(':')[1].trim()
                }
                if (data.indexOf('Finished:') > -1) {
                  torrentETA = 'finished'
                }
                if (data.indexOf('Up:') > -1) {
                  torrentUpSpeed = convertRate(data.split(':')[1].trim())
                }
                if (data.indexOf('Down:') > -1) {
                  torrentDownSpeed = convertRate(data.split(':')[1].trim())
                }
              })

              var torrent = new tTorrentData({
                name: torrentName,
                size: torrentSize,
                progress: torrentProgress,
                status: torrentStatus,
                downSpeed: torrentDownSpeed,
                upSpeed: torrentUpSpeed,
                eta: torrentETA,
                hash: torrentHash
              })
              torrents.push(torrent)
            })
            return torrents
          })
        },
        getFiles: function(infoHash) {
          // not available
          return $q.resolve([{}])
        },
        addMagnet: function(magnetHash) {
          var headers = {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
          if (this.config.use_auth) {
            headers.Authorization = [this.config.username, this.config.password]
          }
          return $http.post(this.getUrl('addmagnet'), 'url=' + encodeURIComponent(magnetHash), {
            headers: headers
          })
        },
        addTorrentByUrl: function(url, infoHash, releaseName) { // UNTESTED
          var self = this
          return this.addMagnet(url).then(function(result) {
            var currentTry = 0
            var maxTries = 5
            // wait for tTorrent to add the torrent to the list. we poll 5 times until we find it, otherwise abort.
            return $q(function(resolve, reject) {
              function verifyAdded() {
                currentTry++
                self.getTorrents().then(function(result) {
                  var hash = null
                  // for each torrent compare the torrent.hash with .torrent infoHash
                  result.map(function(torrent) {
                    if (torrent.hash.toUpperCase() == infoHash) {
                      hash = infoHash
                    }
                  })
                  if (hash !== null) {
                    resolve(hash)
                  } else {
                    if (currentTry < maxTries) {
                      setTimeout(verifyAdded, 1000)
                    } else {
                      throw 'Hash ' + infoHash + ' not found for torrent ' + releaseName + ' in ' + maxTries + ' tries.'
                    }
                  }
                })
              }
              setTimeout(verifyAdded, 1000)
            })
          })
        },
        addTorrentByUpload: function(data, infoHash, releaseName) {
          var self = this
          var headers = {
            'Content-Type': undefined
          }
          if (this.config.use_auth) {
            headers.Authorization = [this.config.username, this.config.password]
          }
          var fd = new FormData()
          fd.append('torrentfile', data, releaseName + '.torrent')

          return $http.post(this.getUrl('addfile'), fd, {
            transformRequest: angular.identity,
            headers: headers
          }).then(function(result) {
            var currentTry = 0
            var maxTries = 5
            // wait for tTorrent to add the torrent to the list. we poll 5 times until we find it, otherwise abort.
            return $q(function(resolve, reject) {
              function verifyAdded() {
                currentTry++
                self.getTorrents().then(function(result) {
                  var hash = null
                  // for each torrent compare the torrent.hash with .torrent infoHash
                  result.map(function(torrent) {
                    if (torrent.hash.toUpperCase() == infoHash) {
                      hash = infoHash
                    }
                  })
                  if (hash !== null) {
                    resolve(hash)
                  } else {
                    if (currentTry < maxTries) {
                      setTimeout(verifyAdded, 1000)
                    } else {
                      throw 'Hash ' + infoHash + ' not found for torrent ' + releaseName + ' in ' + maxTries + ' tries.'
                    }
                  }
                })
              }
              setTimeout(verifyAdded, 1000)
            })
          })
        },
        execute: function(method, id) {
          var headers = {
            'Content-Type': 'application/x-www-form-urlencoded',
            'charset': 'utf-8'
          }
          if (this.config.use_auth) {
            headers.Authorization = [this.config.username, this.config.password]
          }
          return $http.post(this.getUrl(method, id), {
            headers: headers
          }).then(function(response) {
            console.debug('exec', method, id, response)
          })
        }
      })

      return tTorrentAPI
    }
  ])

  .factory('tTorrent', ['BaseTorrentClient', 'tTorrentRemote', 'tTorrentAPI',
    function(BaseTorrentClient, tTorrentRemote, tTorrentAPI) {
      var tTorrent = function() {
        BaseTorrentClient.call(this)
      }
      tTorrent.extends(BaseTorrentClient, {})

      var service = new tTorrent()
      service.setName('tTorrent')
      service.setAPI(new tTorrentAPI())
      service.setRemote(new tTorrentRemote())
      service.setConfigMappings({
        server: 'ttorrent.server',
        port: 'ttorrent.port',
        username: 'ttorrent.username',
        password: 'ttorrent.password',
        use_auth: 'ttorrent.use_auth'
      })
      service.setEndpoints({
        portscan: '/',
        torrents: '/torrents',
        addmagnet: '/cmd/downloadFromUrl',
        addfile: '/cmd/downloadTorrent',
        start: '/cmd/resume/%s',
        pause: '/cmd/pause/%s',
        remove: '/cmd/remove/%s'
      })
      service.readConfig()

      return service
    }
  ])

  .run(['DuckieTorrent', 'tTorrent', 'SettingsService',
    function(DuckieTorrent, tTorrent, SettingsService) {
      if (SettingsService.get('torrenting.enabled')) {
        DuckieTorrent.register('tTorrent', tTorrent)
      }
    }
  ])
;
DuckieTorrent
/**
 * DuckieTorrent Utorrent (v3.3+)/ Bittorrent interface
 * Inspired by and reverse-engineered from Bittorrent's Torque labs btapp.js
 *
 * https://github.com/bittorrenttorque
 * https://github.com/bittorrenttorque/btapp
 * https://github.com/bittorrenttorque/visualizer
 *
 * This project was started because I have an angular.js app and I do not want the
 * dependencies to Torque, Backbone, Lodash, etc that btapp.js has. This should be a service with
 * a completely separated GUI, which it is now.
 *
 * The Utorrent/Bittorrent clients listen on one of 20 ports on localhost to allow other apps to connect
 * to them.
 * *****************************************************************
 * port 10000 is no longer discoverable as at version 3.5.3
 * https://engineering.bittorrent.com/2018/02/22/httprpc-security-vulnerabilities-resolved-in-utorrent-bittorrent-and-utorrent-web/
 * *****************************************************************
 * Discovery is done by performing a /version request to these ports until the first hit
 * After that, an authentication token is requested on the client (you need to save this somewhere, the demo does so in localStorage)
 * With the token you can get a session ID, and with the session ID you can start polling for data. Don't poll and the session will expire
 * and you will need to fetch a new session ID with the token.
 *
 * Polling for data results in a tree structure of RPC functions and object data
 * The RPC structures are matched against regexes and the parameters are type-checked.
 * Passing the wrong data into a callback will crash uTorrent/BitTorrent violently (Which could be an attack angle for security researchers)
 *
 * Since the amount of data that's returned from the torrent application to the browser can be quite large, multiple requests will build up your
 * local state (stored in the uTorrentRemote service)
 *
 * - Does not support setting the download directory (I have not found any docs so far for parms of btapp.add.torrent(). Garfield69)
 * - Does not support setting a Label during add.torrent (I have not found any docs so far for parms of btapp.add.torrent(). Garfield69)
 */
  .provider('uTorrent', function() {
    /**
     * Predefined endpoints for API actions.
     */
    this.endpoints = {
      pair: 'http://localhost:%s/gui/pair',
      version: 'http://localhost:%s/version/',
      ping: 'http://localhost:%s/gui/pingimg',
      api: 'http://localhost:%s/btapp/'
    }

    /**
     * If a specialized parser is needed for a response than it can be automatically picked up by adding the type and a parser
     * function here.
     */
    this.parsers = {

    }

    /**
     * Automated parser for responses for usage when necessary
     */
    this.getParser = function(type) {
      return (type in this.parsers) ? this.parsers[type] : function(data) {
        return data.data
      }
    }

    /**
     * Fetches the URL, auto-replaces the port in the URL if it was found.
     */
    this.getUrl = function(type, param) {
      var out = this.endpoints[type]
      if (this.port != null) {
        out = out.replace('%s', this.port)
      }
      return out.replace('%s', encodeURIComponent(param))
    }

    this.currentPort = 0
    this.port = null
    this.sessionKey = null
    this.authToken = null
    this.isPolling = false
    this.isConnecting = false
    this.connected = false
    this.initialized = false

    this.$get = ['$rootScope', '$q', '$http', 'URLBuilder', '$parse', 'uTorrentRemote', '$sce',
      function($rootScope, $q, $http, URLBuilder, $parse, uTorrentRemote, $sce) {
        var self = this

        /**
             * Build a JSONP request using the URLBuilder service.
             * Auto-magically adds the JSON_CB option and executes the built in parser, or returns the result
             * JSON_CALLBACK cannot be used as a callback name anymore apparently.
             * @param string type URL to fetch from the request types
             * @param object params GET parameters
             * @param object options $http optional options
             */
        var jsonp = function(type, params, options) {
          var d = $q.defer()
          params = angular.extend(params || {}, {
            jsonpCallbackParam: 'JSON_CB'
          })

          var parser = self.getParser(type)
          var url = URLBuilder.build(self.getUrl(type), params)
          var safeUrl = $sce.trustAsResourceUrl(url) // Untrusted URLs will no longer work

          $http.jsonp(safeUrl, options || {}).then(function(response) {
            d.resolve(parser ? parser(response) : response.data)
          }, function(err) {
            d.reject(err)
          })
          return d.promise
        }

        var methods = {
          getName: function() {
            return 'uTorrent'
          },
          /**
                 * Execute a portScan on one of the 20 ports that were generated with the algorithm, stop scanning when a response is found.
                 * Sets the found port index in self.currentPort;
                 */
          portScan: function(ports) {
            var d = $q.defer()

            var nextPort = function() {
              self.port = ports[self.currentPort]
              jsonp('version', {}, {timeout: 850}).then(function(result) {
                if (typeof result === 'undefined') {
                  d.reject('no torrent client listening on port ' + self.port)
                }
                d.resolve({
                  port: ports[self.currentPort],
                  version: result
                })
              }, function(err) {
                if (self.currentPort < 20) {
                  self.currentPort++
                  nextPort()
                } else {
                  d.reject('No active uTorrent/BitTorrent client found!')
                }
              })
            }
            nextPort()
            return d.promise
          },
          setPort: function(port) {
            self.port = port
          },
          /**
                 * Execute a torrent client pair request, and give the user 60 seconds to respond.
                 */
          pair: function() {
            return jsonp('pair', {
              name: 'DuckieTV'
            }, {
              timeout: 60000
            })
          },
          /**
                 * Once you've fetched an authentication token, call this function with it to establish a connection.
                 * Note : The connection needs to be kept open by polling or the session will time out.
                 */
          connect: function(authToken) {
            if (self.connected) {
              var p = $q.defer()
              p.resolve(function() {
                return {
                  session: self.sessionKey,
                  authToken: self.authToken
                }
              })
              return p.promise
            }
            return jsonp('api', {
              pairing: authToken,
              type: 'state',
              queries: '[["btapp"]]',
              hostname: window.location.host
            }).then(function(session) {
              console.info('Retrieved session key!', session)
              self.sessionKey = session.session
              self.authToken = authToken
              self.connected = true
              $rootScope.$broadcast('torrentclient:connected', methods.getRemote())
              return session
            }, function(fail) {
              console.error('Error starting session with auth token %s!', authToken)
            })
          },
          /**
                 * Execute and handle the API's 'update' query.
                 * Parses out the events, updates, properties and methods and dispatches them to the uTorrentRemote interface
                 * for storage, handling and attaching RPC methods.
                 */
          statusQuery: function() {
            return jsonp('api', {
              pairing: self.authToken,
              session: self.sessionKey,
              type: 'update',
              hostname: window.location.host
            }).then(function(data) {
              if (data == 'invalid request') {
                throw 'unauthorized'
              }
              if ('error' in data) {
                return {
                  error: data
                }
              }
              data.map(function(el) {
                var type = Object.keys(el)[0]
                var category = Object.keys(el[type].btapp)[0]
                var data
                if (typeof el[type].btapp[category] === 'string') {
                  category = 'btappMethods'
                  data = el[type].btapp
                } else {
                  data = 'all' in el[type].btapp[category] && !('set' in el[type].btapp[category]) ? el[type].btapp[category].all : el[type].btapp[category]
                  if (!('all' in el[type].btapp[category]) || 'set' in el[type].btapp[category]) category += 'Methods'
                }
                // console.debug("Handle remote", el, type, category, data);
                uTorrentRemote.handleEvent(type, category, data, methods.RPC)
              })
              return data
            }, function(error) {
              console.error('Error executing get status query!', error)
            })
          },
          /**
                 * Return the interface that handles the remote data.
                 */
          getRemote: function() {
            return uTorrentRemote
          },
          /**
                 * Execute a remote procedure function.
                 * This function is passed all the way from here to the actual RPCObject's function.
                 */
          RPC: function(path, args) {
            p = path.split('.')
            if (!args) args = []
            return jsonp('api', {
              pairing: self.authToken,
              session: self.sessionKey,
              type: 'function',
              path: [p],
              'args': JSON.stringify(args),
              hostname: window.location.host
            })
          },
          /**
                 * Todo: listen for these events
                 */
          attachEvents: function() {
            /* { "add": { "btapp": { "events": { "all": { "
                    path:["btapp","events","set"]
                    args:["appDownloadProgress","bt_05321785204295053489"]
                    path:["btapp","events","set"]
                    args:["appMessage","bt_56894816204235029082"]
                    path:["btapp","events","set"]
                    args:["appStopping","bt_78413389069652724491"]
                    path:["btapp","events","set"]
                    args:["appUninstall","bt_61359101496962791011"] */
          },
          /**
                 * Execute a portScan on any of the 20 ports that are generated by the get_port API until one works.
                 * If it works, store it in uTorrent.port
                 */
          retryTimeout: null,
          Scan: function() {
            var p = $q.defer()
            var ports = []
            for (var i = 0; i < 20; i++) {
              ports.push(7 * Math.pow(i, 3) + 3 * Math.pow(i, 2) + 5 * i + 10000)
            }
            methods.portScan(ports).then(function(result) {
              // console.debug("Ping result on port", result);
              localStorage.setItem('utorrent.port', result.port)
              methods.setPort(result.port)
              p.resolve(result.port)
            }, function(err) {
              clearTimeout(self.retryTimeout)
              self.currentPort = 0
              self.port = null
              self.sessionKey = null
              self.authToken = null
              self.isPolling = false
              self.isConnecting = false
              self.connected = false
              self.initialized = false
              self.retryTimeout = setTimeout(function() {
                self.offline = false
                methods.AutoConnect()
              }, 15000)
              console.info('Unable to connect to ' + methods.getName() + ' Retry in 15 seconds')
            })
            return p.promise
          },
          /**
                 * Connect with an auth token obtained by the Pair function.
                 * Store the resulting session key in $scope.session
                 * You can call this method as often as you want. It'll return a promise that holds
                 * off on resolving until the client is connected.
                 * If it's connected and initialized, a promise will return that immediately resolves with the remote interface.
                 */
          AutoConnect: function() {
            if (!self.isConnecting && !self.connected) {
              self.connectPromise = $q.defer()
              self.isConnecting = true
            } else {
              return (!self.connected || !self.initialized) ? self.connectPromise.promise : $q(function(resolve) {
                resolve(methods.getRemote())
              })
            }

            /**
                     * A little promise-setTimeout loop to wait for uTorrent to finish flushing all it's torrent data
                     * The once we're connected
                     */
            var waitForInitialisation = function() {
              if (!self.initPromise) {
                self.initPromise = $q.defer()
              }

              if (self.connected && self.initialized) {
                self.initPromise.resolve(true)
                return
              }

              if (!self.connected || !self.initialized) {
                setTimeout(waitForInitialisation, 50)
              }

              return self.initPromise.promise
            }

            var connectFunc = function() {
              methods.connect(localStorage.getItem('utorrent.token')).then(function(result) {
                if (!self.isPolling) {
                  self.isPolling = true
                  methods.Update()
                }
                self.isConnecting = false
                waitForInitialisation().then(function() {
                  self.connectPromise.resolve(methods.getRemote())
                })
              })
            }

            if (!localStorage.getItem('utorrent.preventconnecting') && !localStorage.getItem('utorrent.token')) {
              methods.Scan().then(function() {
                methods.Pair().then(connectFunc, function(error) {
                  if (error == 'PAIR_DENIED' && confirm('You denied the uTorrent/BitTorrent Client request. \r\nDo you wish to prevent any future connection attempt?')) {
                    localStorage.setItem('utorrent.preventconnecting', true)
                  }
                })
              })
            } else {
              if (!localStorage.getItem('utorrent.preventconnecting')) {
                methods.Scan().then(connectFunc)
              }
            }

            return self.connectPromise.promise
          },

          /**
                 * Execute a pair promise against uTorrent
                 * It waits 30 seconds for the promise to timeout.
                 * When it works, it stores the returned auth token for connecting with the Connect function
                 */
          Pair: function() {
            return methods.pair().then(function(result) {
              // console.debug("Received auth token!", result);
              var key = typeof result === 'object' ? result.pairing_key : result // switch between 3.3.x and 3.4.1 build 31206 pairing method
              if (key == '<NULL>') {
                throw 'PAIR_DENIED'
              } else {
                localStorage.setItem('utorrent.token', key)
                self.authToken = result // .pairing_key;
              }
            }, function(err) {
              console.error('Eror pairing!', err)
            })
          },
          togglePolling: function() {
            self.isPolling = !self.isPolling
            self.Update()
          },
          /**
                 * Start the status update polling.
                 * Stores the resulting TorrentClient service in $scope.rpc
                 * Starts polling every 1s.
                 */
          Update: function(dontLoop) {
            if (self.isPolling === true) {
              return methods.statusQuery().then(function(data) {
                if (data.length === 0) {
                  self.initialized = true
                }
                if (undefined === dontLoop && self.isPolling && !data.error) {
                  setTimeout(methods.Update, data && data.length === 0 ? 3000 : 0) // burst when more data comes in, delay when things ease up.
                }
                return data
              })
            }
          },
          isConnected: function() {
            return self.connected
          },
          Disconnect: function() {
            self.isPolling = false
            uTorrentRemote.torrents = {}
            uTorrentRemote.eventHandlers = {}
          },
          addMagnet: function(magnet) {
            uTorrentRemote.add.torrent(magnet)
          },
          addTorrentByUpload: function() {
            throw 'Upload Torrent Not implemented in uTorrent remote.'
          },

          addTorrentByUrl: function(url, infoHash) {
            return uTorrentRemote.add.torrent(url).then(function(result) {
              return methods.Update(true)
            }).then(function() {
              return $q(function(resolve) {
                setTimeout(function() {
                  var matches = Object.keys(uTorrentRemote.torrents).filter(function(key) {
                    return uTorrentRemote.torrents[key].properties.all.hash.toUpperCase() == infoHash
                  })
                  if (matches.length > 0) {
                    resolve(matches[0])
                  }
                }, 5000)
              })
            })
          },
          /**
                 * this API does not currently support setting the Download Path when adding magnets and .torrents.
                 */
          isDownloadPathSupported: function() {
            return false
          },
          /**
                 * this API does not currently support setting a Label when adding magnets and .torrents.
                 */
          isLabelSupported: function() {
            return false
          },
          hasTorrent: function(torrent) {
            return $q.resolve(torrent in uTorrentRemote.torrents && 'hash' in uTorrentRemote.torrents[torrent])
          }
        }
        return methods
      }
    ]
  })
/**
 * Some RPC Call validation methods taken mostly directly from btapp.js
 * Converted to plain angular / JavaScript to keep this dependency-free
 */
  .factory('RPCCallService', function() {
    var service = {
      // Seeing as we're interfacing with a strongly typed language c/c++ we need to
      // ensure that our types are at least close enough to coherse into the desired types
      // takes something along the lines of "[native function](string,unknown)(string)".
      validateArguments: function(functionValue, variables) {
        if (typeof functionValue !== 'string') {
          console.error('Expected functionValue to be a string', functionValue, typeof functionValue, variables)
          return false
        }
        var signatures = functionValue.match(/\(.*?\)/g)
        return signatures.filter(function(signature) {
          signature = signature.match(/\w+/g) || [] // ["string","unknown"]
          return signature.length === variables.length && signature.map(function(type, index) {
            if (typeof variables[index] === 'undefined') {
              throw 'client functions do not support undefined arguments'
            } else if (variables[index] === null) {
              return true
            }

            switch (type) {
              // Most of these types that the client sends up match the typeof values of the JavaScript
              // types themselves so we can do a direct comparison
              case 'number':
              case 'string':
              case 'boolean':
                return typeof variables[index] === type
                // In the case of unknown, we have no choice but to trust the argument as
                // the client hasn't specified what type it should be
              case 'unknown':
                return true
              case 'array':
                return typeof variables[index] === 'object'
              case 'dispatch':
                return typeof variables[index] === 'object' || typeof variables[index] === 'function'
              default:
                // has the client provided a type that we weren't expecting?
                throw 'there is an invalid type in the function signature exposed by the client'
            }
          })
        })
      },
      convertCallbackFunctionArgs: function(args) {
        args.map(function(value, key) {
          // We are responsible for converting functions to variable names...
          // this will be called later via a event with a callback and arguments variables
          if (typeof value === 'function') {
            args[key] = service.storeCallbackFunction(value)
          } else if (typeof value === 'object' && value) {
            service.convertCallbackFunctionArgs(value)
          }
        }, this)
      },
      // We can't send function pointers to the torrent client server, so we'll send
      // the name of the callback, and the server can call this by sending an event with
      // the name and args back to us. We're responsible for making the call to the function
      // when we detect this. This is the same way that jquery handles ajax callbacks.
      storeCallbackFunction: function(cb) {
        // console.debug("Create a callback function for ", cb);
        cb = cb || function() {}
        var str = 'bt_' + new Date().getTime()
        this.btappCallbacks[str] = cb
        return str
      },
      call: function(path, signature, args, rpcTarget) {
        // console.debug("Trying to call RPC function: ", path, signature, args);
        // This is as close to a static class function as you can get in JavaScript i guess
        // we should be able to use verifySignaturesArguments to determine if the client will
        // consider the arguments that we're passing to be valid
        if (!service.validateArguments.call(service, signature, args)) {
          console.error('Arguments do not match signature!', args, signature, path)
          throw 'arguments do not match any of the function signatures exposed by the client'
        }
        service.convertCallbackFunctionArgs(args)
        // console.debug("Calling RPC Function!", path, signature, args, rpcTarget);
        return rpcTarget(path, args)
      }
    }

    return service
  })
/**
 * uTorrent/Bittorrent remote singleton that receives the incoming data
 */
  .factory('uTorrentRemote', ['$parse', '$rootScope', 'RPCCallService', 'TorrentHashListService',
    function($parse, $rootScope, RPCCallService, TorrentHashListService) {
      /**
         * RPC Object that wraps the remote data that comes in from uTorrent.
         * It stores all regular properties on itself
         * and makes sure that the remote function signatures are verified (using some code borrowed from the original btapp.js)
         * and a dispatching function with the matching signature is created and mapped to the RPCCallService
         * (to keep the overhead of creating many RPC call functions as low as possible)
         */
      var RPCObject = function(path, data, RPCProxy) {
        var callbacks = {}

        for (var property in data) {
          this[property] = this.isRPCFunctionSignature(data[property]) ? this.createFunction(path, property, data[property], RPCProxy) : data[property]
        }
      }

      RPCObject.prototype = {
        /**
             * Return a human-readable status for a torrent
             */
        getFormattedStatus: function() {
          var statuses = {
            128: 'stopped',
            136: 'stopped',
            137: 'started',
            152: 'Error: Files missing, please recheck',
            198: 'Connecting to peers',
            200: 'started',
            201: 'downloading',
            233: 'paused'
          }
          if (!(this.properties.all.status in statuses)) {
            console.warn("There's an unknown status for this torrent!", this.properties.all.status, this)
            return this.properties.all.status
          }
          return statuses[this.properties.all.status]
        },
        getName: function() {
          return $parse('properties.all.name')(this)
        },
        getStarted: function() {
          return $parse('properties.all.added_on')(this)
        },
        getProgress: function() {
          var pr = $parse('properties.all.progress')(this)
          return pr ? pr / 10 : pr
        },
        getDownloadSpeed: function() {
          return $parse('properties.all.download_speed')(this)
        },
        getStatusCode: function() {
          return this.properties.all.status
        },
        getFiles: function() {
          var files = []
          angular.forEach($parse('file.all')(this), function(el, key) {
            files.push(el)
          })
          angular.forEach($parse('files.all')(this), function(el, key) {
            files.push(el)
          })
          return new Promise(function(resolve) {
            resolve(files)
          })
        },
        getDownloadDir: function() {
          return $parse('properties.all.directory')(this)
        },
        /**
             * The torrent is started if the status is uneven.
             */
        isStarted: function() {
          return this.properties.all.status % 2 === 1
        },
        // We expect function signatures that come from the client to have a specific syntax
        isRPCFunctionSignature: function(f) {
          return typeof f === 'string' && (f.match(/\[native function\](\([^\)]*\))+/) || f.match(/\[nf\](\([^\)]*\))+/))
        },
        createFunction: function(path, func, signature, RPCProxy) {
          path = 'btapp.' + path + '.' + func
          var func = function() {
            var i; var args = []
            for (i = 0; i < arguments.length; i++) {
              args.push(arguments[i])
            }
            return RPCCallService.call(path, signature, args, RPCProxy)
          }
          func.valueOf = function() {
            return 'function' + signatures.substring(4) + ' (returns promise)'
          }
          return func
        }
      }

      var hookMethods = {
        addEvents: function(data) {
          // console.debug("Add events!", data);
        },
        addRss: function(data) {
          // console.debug("Add RSS!", data);
        },
        addTrackerMethods: function(data) {
          // console.debug("Add Tracker Methods!", data);
        },
        addRsaMethods: function(data) {
          // console.debug("Add RSA Methods!", data);
        },
        addStash: function(data) {
          // console.debug("Add stash!", data);
        },
        addStashMethods: function(data) {
          // console.debug("Add stash methods!", data);
        },
        addEventsMethods: function(data, RPCObject) {
          // console.debug("Add Events methods!", data, RPCObject)
        },
        addRssMethods: function(data, rpc) {
          // console.debug("Add RSS Methods: ", data);
        },
        addBtappMethods: function(data, rpc) {
          // console.debug("Add BTAPP Methods: ", data);
          service.btapp = new RPCObject('btapp', data, rpc)
        },
        addOsMethods: function(data, rpc) {
          service.os = new RPCObject('os', data, rpc)

          // console.debug("Add OS Methods: ", data);
        },
        addAddMethods: function(data, rpc) {
          service.add = new RPCObject('add', data, rpc)
          // console.debug("Add Add Methods: ", data);
        },
        addDhtMethods: function(data) {
          // console.debug("Add DHT Methods: ", data);
        },
        addTorrentMethods: function(data, rpc) {
          service.torrent = new RPCObject('torrent', data, rpc)
          // console.debug("Add Torrent Methods!", data);
        },
        addStream: function(data) {
          // console.debug("Add stream!", data);
        },
        addSettings: function(data, rpc) {
          // console.debug("Add Settings!", data, rpc);
        },
        addSettingsMethods: function(data, rpc) {
          // console.debug("Add Settings methods!", data, rpc, a, b, c);
          service.settings = new RPCObject('settings', data, rpc)
        },
        removeTorrent: function(torrent) {
          var key = Object.keys(torrent)[0]
          if ('hash' in torrent[key]) {
            Episode.findOneByMagnetHash(torrent[key].hash.toUpperCase()).then(function(result) {
              if (result) {
                console.info('remote torrent not found, removed magnetHash[%s] from episode[%s] of series[%s]', result.magnetHash, result.getFormattedEpisode(), result.ID_Serie)
                result.magnetHash = null
                result.Persist()
              }
            })
          }
          TorrentHashListService.removeFromHashList(torrent[key].hash.toUpperCase())
          delete service.torrents[torrent[key].hash].hash
          delete service.eventHandlers[torrent[key].hash]
        },
        /**
             * Incoming torrent detail data, add it to the local cached list
             */
        addTorrent: function(data, RPCProxy) {
          var key = Object.keys(data)[0]
          if (key in service.torrents) {
            Object.deepMerge(service.torrents[key], data[key])
          } else {
            service.torrents[key] = new RPCObject('torrent.all.' + key, data[key], RPCProxy)
            // //console.debug("Add torrent!", key, this.getTorrentName(data[key]), this.torrents[key], data);
          }
          if (key in service.eventHandlers) {
            service.eventHandlers[key].map(function(monitorFunc) {
              monitorFunc(service.torrents[key])
            })
          }
          $rootScope.$broadcast('torrent:update:' + key, service.torrents[key])
          $rootScope.$broadcast('torrent:update:', service.torrents[key])
        }
      }

      var service = {
        torrents: {},
        settings: {},
        offEvents: {},
        eventHandlers: {},

        getNameFunc: null,

        getTorrentName: function(torrent) {
          if (!service.getNameFunc) {
            service.getNameFunc = $parse('properties.all.name')
          }
          return (service.getNameFunc(torrent))
        },

        getTorrents: function() {
          var out = []
          angular.forEach(service.torrents, function(el) {
            if ('hash' in el) {
              out.push(el)
            }
          })
          return out
        },
        getByHash: function(hash) {
          return (hash in service.torrents) ? service.torrents[hash] : null
        },

        onTorrentUpdate: function(hash, callback) {
          var key = 'torrent:update:' + hash
          if (!(key in service.offEvents)) {
            service.offEvents[key] = []
          }
          service.offEvents[key].push($rootScope.$on(key, function(evt, torrent) {
            callback(torrent)
          }))
        },

        offTorrentUpdate: function(hash, callback) {
          var key = 'torrent:update:' + hash
          if ((key in service.offEvents)) {
            service.offEvents[key].map(function(dereg) {
              dereg()
            })
          }
        },
        handleEvent: function(type, category, data, RPCProxy, input) {
          var func = type + String.capitalize(category)
          if (!(func in hookMethods)) {
            console.error('Method not implemented: ', func, data)
          } else {
            hookMethods[func](data, RPCProxy, type, category, input)
          }
        }
      }

      window.bt = service
      return service
    }
  ])

  .run(['DuckieTorrent', 'uTorrent', 'SettingsService',
    function(DuckieTorrent, uTorrent, SettingsService) {
      if (SettingsService.get('torrenting.enabled') && navigator.platform.toLowerCase().indexOf('win') !== -1) {
        // only register uTorrent API on windows platforms #592
        DuckieTorrent.register('uTorrent', uTorrent)
      }
    }
  ])
;
/**
 * uTorrentWebUI
 *
 * API Docs:
 * https://forum.utorrent.com/topic/21814-web-ui-api/
 * https://github.com/bittorrent/webui/blob/master/webui.js
 *
 * - Does not support setting download directory
 * - you can add sub directories to the default download directory by appending
 *   '&download_dir=0,&path=' + encodeURIComponent(subdir)
 *   or select a predefined path and using &download_dir=n (where n is the index to the path table :-( )
 * - Does not support setting a Label during add.torrent
 * - there is a maximum length limit of 1K on magnet strings. see #1114 for details.
 */
var uTorrentWebUIData = function(data) {
  this.update(data)
}

uTorrentWebUIData.extends(TorrentData, {
  getName: function() {
    return this.name
  },
  getProgress: function() {
    return this.round(this.progress / 10, 1)
  },
  getDownloadSpeed: function() {
    return this.download_speed // Bytes/second
  },
  start: function() {
    this.getClient().getAPI().execute('start', this.hash)
  },
  stop: function() {
    this.getClient().getAPI().execute('stop', this.hash)
  },
  pause: function() {
    this.getClient().getAPI().execute('pause', this.hash)
  },
  remove: function() {
    this.getClient().getAPI().execute('remove', this.hash)
  },
  getFiles: function() {
    return this.getClient().getAPI().getFiles(this.hash).then(function(results) {
      this.files = results
      return results
    }.bind(this))
  },
  getDownloadDir: function() {
    return this.download_dir
  },
  isStarted: function() {
    return this.status % 2 === 1
  }
})

/**
 * uTorrentWebUI
 */
DuckieTorrent.factory('uTorrentWebUIRemote', ['BaseTorrentRemote',
  function(BaseTorrentRemote) {
    var uTorrentWebUIRemote = function() {
      BaseTorrentRemote.call(this)
      this.dataClass = uTorrentWebUIData
    }
    uTorrentWebUIRemote.extends(BaseTorrentRemote)

    return uTorrentWebUIRemote
  }
])

  .factory('uTorrentWebUIAPI', ['BaseHTTPApi', '$http', '$q',
    function(BaseHTTPApi, $http, $q) {
      var uTorrentWebUIAPI = function() {
        BaseHTTPApi.call(this)
        this.config.token = ''
      }
      uTorrentWebUIAPI.extends(BaseHTTPApi, {
        /**
             * Fetches the URL, auto-replaces the port in the URL if it was found.
             */
        getUrl: function(type, param) {
          var out = this.config.server + ':' + this.config.port + this.endpoints[type]
          if (out.indexOf('%token%') > -1) {
            out = out.replace('%token%', this.config.token)
          }
          return (param) ? out.replace('%s', encodeURIComponent(param)) : out
        },
        portscan: function() {
          var self = this
          return this.request('portscan').then(function(result) {
            if (result !== undefined) {
              var token = new HTMLScraper(result.data).querySelector('#token').innerHTML
              if (token) {
                self.config.token = token
              }
              return true
            }
            return false
          }, function() {
            return false
          })
        },
        getTorrents: function() {
          var self = this
          return this.request('torrents').then(function(data) {
            return data.data.torrents.map(function(torrent) {
              return {
                hash: torrent[0],
                status: torrent[1],
                name: torrent[2],
                size: torrent[3],
                progress: torrent[4],
                downloaded: torrent[5],
                uploaded: torrent[6],
                ratio: torrent[7],
                upload_speed: torrent[8],
                download_speed: torrent[9],
                eta: torrent[10],
                label: torrent[11],
                peers_connected: torrent[12],
                peers_in_swarm: torrent[13],
                seeds_connected: torrent[14],
                seeds_in_swarm: torrent[15],
                availability: torrent[16],
                torrent_queue_order: torrent[17],
                remaining: torrent[18],
                download_url: torrent[19],
                rss_feed_url: torrent[20],
                status_message: torrent[21],
                stream_id: torrent[22],
                added_on: torrent[23],
                completed_on: torrent[24],
                app_update_url: torrent[25],
                download_dir: torrent[26]
              }
            })
          }, function(e, f) {
            if (e.status === 400) {
              console.warn('uTorrentWebUI returned', e.data.trim(), e.statusText, e.status, 'during getTorrents. Going to retry.')
              self.portscan() // get Token just in case it expired
              return self.getTorrents() // retry
            }
          })
        },
        getFiles: function(hash) {
          return this.request('files', hash).then(function(data) {
            // debugger;
            if ('files' in data.data) {
              return data.data.files[1].map(function(file) {
                return {
                  name: file[0],
                  filesize: file[1],
                  downloaded: file[2],
                  priority: file[3],
                  firstpiece: file[4],
                  num_pieces: file[5],
                  streamable: file[6],
                  encoded_rate: file[7],
                  duration: file[8],
                  width: file[9],
                  height: file[10],
                  stream_eta: file[11],
                  streamability: file[12]
                }
              })
            } else {
              return []
            }
          })
        },
        addMagnet: function(magnetURI) {
          var headers = {
            'Content-Type': undefined
          }
          if (this.config.use_auth) {
            headers.Authorization = [this.config.username, this.config.password]
          }
          var fd = new FormData()
          // check the length of the magnet #1114
          if (magnetURI.length > 1024) {
            var discardedTrackers = ''

            var trackersList = []
            // split the magnet by &tr
            trackersList = magnetURI.split('&tr')
            magnetURI = trackersList[0] // first part of magnetURI prior to trackers list
            // iterate through the trackers until the length is below the limit
            for (var i = 1, aTracker; aTracker = trackersList[i]; i++) {
              if ((magnetURI + '&tr' + aTracker).length <= 1024) {
                magnetURI = magnetURI + '&tr' + aTracker
              } else {
                discardedTrackers = discardedTrackers + '&tr' + aTracker
              }
            }
            // post a message explaining tracker trimming
            console.info('Magnet %s has had the following trackers [%s] removed to fit within the interface 1K length limit', magnetURI.getInfoHash(), discardedTrackers)
          }
          return $http.post(this.getUrl('addmagnet', magnetURI), {
            headers: headers
          })
        },
        addTorrentByUpload: function(data, infoHash, releaseName) {
          var self = this
          var headers = {
            'Content-Type': undefined
          }
          if (this.config.use_auth) {
            headers.Authorization = [this.config.username, this.config.password]
          }
          var fd = new FormData()
          fd.append('torrent_file', data, releaseName + '.torrent')

          return $http.post(this.getUrl('addfile'), fd, {
            transformRequest: angular.identity,
            headers: headers
          }).then(function(result) {
            var currentTry = 0
            var maxTries = 5
            // wait for uTorrent WebUi to add the torrent to the list. we poll 5 times until we find it, otherwise abort.
            return $q(function(resolve, reject) {
              function verifyAdded() {
                currentTry++
                self.getTorrents().then(function(result) {
                  var hash = null
                  // for each torrent compare the torrent.hash with .torrent infoHash
                  result.map(function(torrent) {
                    if (torrent.hash.toUpperCase() == infoHash) {
                      hash = infoHash
                    }
                  })
                  if (hash !== null) {
                    resolve(hash)
                  } else {
                    if (currentTry < maxTries) {
                      setTimeout(verifyAdded, 1000)
                    } else {
                      throw 'Hash ' + infoHash + ' not found for torrent ' + releaseName + ' in ' + maxTries + ' tries.'
                    }
                  }
                })
              }
              setTimeout(verifyAdded, 1000)
            })
          })
        },
        execute: function(method, id) {
          var headers = {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
          if (this.config.use_auth) {
            headers.Authorization = [this.config.username, this.config.password]
          }
          return $http.post(this.getUrl(method, id), {
            headers: headers
          })
        }
      })

      return uTorrentWebUIAPI
    }
  ])

  .factory('uTorrentWebUI', ['BaseTorrentClient', 'uTorrentWebUIRemote', 'uTorrentWebUIAPI',
    function(BaseTorrentClient, uTorrentWebUIRemote, uTorrentWebUIAPI) {
      var uTorrentWebUI = function() {
        BaseTorrentClient.call(this)
      }
      uTorrentWebUI.extends(BaseTorrentClient, {})

      var service = new uTorrentWebUI()
      service.setName('uTorrent Web UI')
      service.setAPI(new uTorrentWebUIAPI())
      service.setRemote(new uTorrentWebUIRemote())
      service.setConfigMappings({
        server: 'utorrentwebui.server',
        port: 'utorrentwebui.port',
        username: 'utorrentwebui.username',
        password: 'utorrentwebui.password',
        use_auth: 'utorrentwebui.use_auth'
      })
      service.setEndpoints({
        portscan: '/gui/token.html',
        torrents: '/gui/?token=%token%&list=1',
        addmagnet: '/gui/?token=%token%&action=add-url&s=%s',
        addfile: '/gui/?token=%token%&action=add-file&download_dir=0&path=',
        stop: '/gui/?token=%token%&action=stop&hash=%s',
        start: '/gui/?token=%token%&action=start&hash=%s',
        pause: '/gui/?token=%token%&action=pause&hash=%s',
        remove: '/gui/?token=%token%&action=remove&hash=%s',
        files: '/gui/?token=%token%&action=getfiles&hash=%s'
      })
      service.readConfig()

      return service
    }
  ])

  .run(['DuckieTorrent', 'uTorrentWebUI', 'SettingsService',
    function(DuckieTorrent, uTorrentWebUI, SettingsService) {
      if (SettingsService.get('torrenting.enabled')) {
        DuckieTorrent.register('uTorrent Web UI', uTorrentWebUI)
      }
    }
  ])
;
/**
 * Vuze has *exactly* the same API as Transmission, so we'll just use that whole implementation and change the config
 * it reads from.
 */
DuckieTorrent.factory('Vuze', ['BaseTorrentClient', 'TransmissionRemote', 'TransmissionAPI',
  function(BaseTorrentClient, TransmissionRemote, TransmissionAPI) {
    var Vuze = function() {
      BaseTorrentClient.call(this)
    }
    Vuze.extends(BaseTorrentClient, {})

    var service = new Vuze()
    service.setName('Vuze')
    service.setAPI(new TransmissionAPI())
    service.setRemote(new TransmissionRemote())
    service.setConfigMappings({
      server: 'vuze.server',
      port: 'vuze.port',
      path: 'vuze.path',
      username: 'vuze.username',
      password: 'vuze.password',
      use_auth: 'vuze.use_auth',
      progressX100: 'vuze.progressX100'
    })
    service.readConfig()

    return service
  }
])

  .run(['DuckieTorrent', 'Vuze', 'SettingsService',
    function(DuckieTorrent, Vuze, SettingsService) {
      if (SettingsService.get('torrenting.enabled')) {
        DuckieTorrent.register('Vuze', Vuze)
      }
    }
  ])
;
/**
 * None
 *
 * This is a dummy torrent client that responds as connected and returns as if all torrents are completed.
 * For use by those that either: are using an unsupported torrent client or don't want to connect to any of the existing ones.
 * This has the benefit of preventing unnecessary log clutter with failed connection attempts,
 * and allows other processes to complete successfully, such as marking a torrent as downloaded after the user launches a torrent manually.
 *
 */
var NoneData = function(data) {
  this.update(data)
}

NoneData.extends(TorrentData, {
  getName: function() {
    return this.name
  },
  getProgress: function() {
    return 100
  },
  getDownloadSpeed: function() {
    return 0 // Bytes/second
  },
  start: function() {
    return true
  },
  stop: function() {
    return true
  },
  pause: function() {
    return true
  },
  remove: function() {
    this.getClient().getAPI().remove(this.hash)
  },
  getDownloadDir: function() {
    return null
  },
  getFiles: function() {
    return this.getClient().getAPI().getFiles(this.hash).then(function(results) {
      this.files = results
      return results
    }.bind(this))
  },
  isStarted: function() {
    return false
  }
})

/**
 * None
 */
DuckieTorrent.factory('NoneRemote', ['BaseTorrentRemote',
  function(BaseTorrentRemote) {
    var NoneRemote = function() {
      BaseTorrentRemote.call(this)
      this.dataClass = NoneData
    }
    NoneRemote.extends(BaseTorrentRemote)

    return NoneRemote
  }
])

  .factory('NoneAPI', ['BaseHTTPApi', '$http', '$q', 'TorrentHashListService', 'SettingsService',
    function(BaseHTTPApi, $http, $q, TorrentHashListService, SettingsService) {
      var NoneAPI = function() {
        BaseHTTPApi.call(this)
      }
      NoneAPI.extends(BaseHTTPApi, {
        portscan: function() {
          return new Promise(function(resolve) {
            return resolve(true)
          })
        },
        getTorrents: function() {
          return new Promise(function(resolve) {
            var output = []
            Object.keys(TorrentHashListService.hashList).map(function(hash) {
              output.push({hash: hash, name: hash})
            })
            return resolve(output)
          })
        },
        getFiles: function() {
          return new Promise(function(resolve) {
            return resolve([])
          })
        },
        remove: function(hash) {
          return new Promise(function(resolve) {
            TorrentHashListService.removeFromHashList(hash)
            return resolve(true)
          })
        },
        addMagnet: function(magnetURI) {
          var self = this
          return new Promise(function(resolve) {
            self.openUrl('magnet', magnetURI)
            return resolve(true)
          })
        },
        addTorrentByUrl: function(torrentUrl, infoHash, releaseName) {
          var self = this
          return new Promise(function(resolve) {
            self.openUrl('torrent', torrentUrl)
            return resolve(infoHash)
          })
        },
        openUrl: function(id, url) {
          // revert back to using iframe, https://github.com/SchizoDuckie/DuckieTV/issues/1308
/*          if (SettingsService.isStandalone() && id === 'magnet') {
            // for standalone, open magnet url direct to os https://github.com/SchizoDuckie/DuckieTV/issues/834
            nw.Shell.openExternal(url)
            // console.debug("Open via OS", id, url);
          } else {*/
            // for chrome extension, open url on chromium via iframe
            var d = document.createElement('iframe')
            d.id = id + 'url_' + new Date().getTime()
            d.style.visibility = 'hidden'
            d.src = url
            document.body.appendChild(d)
            // console.debug("Open via Chromium", d.id, url);
            var dTimer = setInterval(function() {
              var dDoc = d.contentDocument || d.contentWindow.document
              if (dDoc.readyState == 'complete') {
                document.body.removeChild(d)
                clearInterval(dTimer)
                return
              }
            }, 1500)
//          }
        }
      })

      return NoneAPI
    }
  ])

  .factory('None', ['BaseTorrentClient', 'NoneRemote', 'NoneAPI',
    function(BaseTorrentClient, NoneRemote, NoneAPI) {
      var None = function() {
        BaseTorrentClient.call(this)
      }
      None.extends(BaseTorrentClient, {})

      var service = new None()
      service.setName('None')
      service.setAPI(new NoneAPI())
      service.setRemote(new NoneRemote())
      service.setConfigMappings({})
      service.setEndpoints({})
      service.readConfig()

      return service
    }
  ])

  .run(['DuckieTorrent', 'None', 'SettingsService',
    function(DuckieTorrent, None, SettingsService) {
      if (SettingsService.get('torrenting.enabled')) {
        DuckieTorrent.register('None', None)
      }
    }
  ])
;
/**
 * Abstraction layer for the different torrent search engines that DuckieTV supports.
 * Search engines register themselves in the app's .run() block using TorrentSearchEngines.registerEngine(name, instance)
 *
 * All an engine needs to provide is a .search method. It can be both an angular factory or a plain old javascript instantiated function
 * The TorrentDialog directive lists these search engines and can switch between them.
 * The AutoDownloadService uses the default engine to look for torrents on aired episodes.
 *
 * There is a GenericTorrentSearchEngine.js in this folder that can scrape a lot of torrent sites by just passing in some endpoints and css selectors.
 * @see GenericTorrentSearch for more info or browse through the other torrent clients in this folder.
 */

DuckieTV.factory('TorrentSearchEngines', ['$rootScope', '$q', '$http', '$injector', 'DuckieTorrent', 'dialogs', 'SettingsService', 'SceneNameResolver', 'TorrentHashListService',
  function($rootScope, $q, $http, $injector, DuckieTorrent, dialogs, SettingsService, SceneNameResolver, TorrentHashListService) {
    var activeEngines = {}

    var nativeEngines = {}

    var jackettEngines = {}

    var defaultEngineName = 'ThePirateBay'

    var templateName = 'templates/dialogs/torrent.html'

    var dialogCtrl = 'torrentDialogCtrl'

    if (SettingsService.get('torrentDialog.2.enabled')) {
      templateName = 'templates/dialogs/torrent2.html'
      dialogCtrl = 'torrentDialog2Ctrl'
    }

    function openUrl(id, url) {
      // revert back to using iframe, https://github.com/SchizoDuckie/DuckieTV/issues/1308
/*      if (SettingsService.isStandalone() && id === 'magnet') {
        // for standalone, open magnet url direct to os https://github.com/SchizoDuckie/DuckieTV/issues/834
        nw.Shell.openExternal(url)
        // console.debug("Open via OS", id, url);
      } else {*/
        // for chrome extension, open url on chromium via iframe
        var d = document.createElement('iframe')
        d.id = id + 'url_' + new Date().getTime()
        d.style.visibility = 'hidden'
        d.src = url
        document.body.appendChild(d)
        // console.debug("Open via Chromium", d.id, url);
        var dTimer = setInterval(function() {
          var dDoc = d.contentDocument || d.contentWindow.document
          if (dDoc.readyState == 'complete') {
            document.body.removeChild(d)
            clearInterval(dTimer)
            return
          }
        }, 1500)
//      }
    }

    var service = {

      // list of common current trackers for SE that don't provide any on their magnets (1337x, IsoHunt, Idope, LimeTorrents, TorrentZ2)
      trackers: '',

      // cache of DB jackett elements
      jackettCache: [],

      // return DB jackett element from cache by name
      getJackettFromCache: function(name) {
        return service.jackettCache.filter(function(el) {
          return el.name == name
        })[0]
      },

      // delete DB jackett element from cache
      removeJackettFromCache: function(name) {
        var jackett = service.getJackettFromCache(name)
        if (jackett) {
          service.jackettCache = service.jackettCache.filter(function(el) {
            return el.getID() != jackett.getID()
          })
        }
      },

      // register native SE (and disable jackett SE of same name)
      registerSearchEngine: function(name, implementation) {
        if (name in jackettEngines) {
          var jackett = service.getJackettFromCache(name)
          jackett.setDisabled()
          jackettEngines[name].enabled = false
          console.info('Jackett Engine %s disabled.', name)
        }
        implementation.enabled = true
        implementation.config.name = name
        activeEngines[name] = nativeEngines[name] = implementation
        name in activeEngines ? console.info('Updating torrent search engine', name) : console.info('Registering torrent search engine:', name)
      },

      // register jackett SE (and disable native SE of same name)
      registerJackettEngine: function(name, implementation) {
        if (name in nativeEngines) {
          nativeEngines[name].enabled = false
          console.info('torrent Engine %s disabled.', name)
        }
        implementation.enabled = true
        activeEngines[name] = jackettEngines[name] = implementation
        name in activeEngines ? console.info('Updating Jackett search engine', name) : console.info('Registering Jackett search engine:', name)
      },

      // add jackett SE from DB jackett element (add to cache, and register it if enabled)
      addJackettEngine: function(jackett) {
        var config = JSON.parse(jackett.json)
        var engine = new GenericTorrentSearchEngine(config, $q, $http, $injector)
        engine.testOK = true
        engine.testMessage = ''
        engine.testing = false
        engine.enabled = false
        jackettEngines[jackett.name] = engine
        if (jackett.isEnabled()) {
          engine.enabled = true
          console.log('Jackett search engine loaded and added to activeEngines: ', jackett.name)
          if (jackett.name in activeEngines) {
            console.warn('Jackett engine %s overrides built-in search engine with the same name.', jackett.name)
          }
          service.registerJackettEngine(jackett.name, engine)
        }
        service.jackettCache.push(jackett)
      },

      // return all active engines (both native and jackett)
      getSearchEngines: function() {
        return activeEngines
      },

      // return active SE by name
      getSearchEngine: function(name) {
        if (name in activeEngines) {
          return activeEngines[name]
        } else {
          console.warn('search provider %s not found. default %s provider used instead.', name, defaultEngineName)
          return activeEngines[defaultEngineName]
        }
      },

      // return all native SEs
      getNativeEngines: function() {
        return nativeEngines
      },

      // return the default search engine
      getDefaultEngine: function() {
        return activeEngines[defaultEngineName]
      },

      // return the default search engine name
      getDefaultEngineName: function() {
        return defaultEngineName
      },

      // return all jackett SEs
      getJackettEngines: function() {
        return jackettEngines
      },

      // return a jackett SE by name
      getJackettEngine: function(name) {
        return jackettEngines[name]
      },

      // set the default SE by name
      setDefault: function(name) {
        if (name in activeEngines) {
          defaultEngineName = name
        }
      },

      // delete a jackett engine (from everywhere)
      removeJackettEngine: function(engine) {
        delete jackettEngines[engine.config.name]
        if (engine.enabled) {
          delete activeEngines[engine.config.name]
        }
        var jackett = service.getJackettFromCache(engine.config.name)
        if ('Delete' in jackett) {
          jackett.Delete().then(function() {
            service.jackettCache = service.jackettCache.filter(function(el) {
              return el.getID() != jackett.getID()
            })
            console.info("Jackett '" + jackett.name + "' deleted.")
          })
        }
      },

      // disable active SE (and if jackett then enable native SE of same name)
      disableSearchEngine: function(engine) {
        delete activeEngines[engine.config.name]
        if ('isJackett' in engine.config && engine.config.isJackett) {
          var jackett = service.getJackettFromCache(engine.config.name)
          jackett.setDisabled()
          jackettEngines[engine.config.name].enabled = false
          console.info('Jackett Engine %s disabled.', engine.config.name)
          if (engine.config.name in nativeEngines) {
            service.enableSearchEngine(nativeEngines[engine.config.name])
          }
        } else {
          nativeEngines[engine.config.name].enabled = false
          console.info('torrent Engine %s disabled.', engine.config.name)
        }
      },

      // enable SE (either jackett or native)
      enableSearchEngine: function(engine) {
        if ('isJackett' in engine.config && engine.config.isJackett) {
          service.registerJackettEngine(engine.config.name, engine)
          var jackett = service.getJackettFromCache(engine.config.name)
          jackett.setEnabled()
        } else {
          service.registerSearchEngine(engine.config.name, engine)
        }
      },

      findEpisode: function(serie, episode) {
        return SceneNameResolver.getSearchStringForEpisode(serie, episode).then(function(searchString) {
          return dialogs.create(templateName, dialogCtrl, {
            query: searchString,
            TRAKT_ID: episode.TRAKT_ID,
            serie: serie,
            episode: episode
          }, {
            size: 'lg'
          })
        })
      },

      search: function(query, TRAKT_ID, options) {
        return dialogs.create(templateName, dialogCtrl, {
          query: query,
          TRAKT_ID: TRAKT_ID
        }, options || {
          size: 'lg'
        })
      },
      /**
             * launch magnet via a hidden iframe and broadcast the fact that it's selected to anyone listening
             */
      launchMagnet: function(magnet, TRAKT_ID, dlPath, label) {
        console.info('Firing magnet URI! ', magnet, TRAKT_ID, dlPath, label)

        if (!SettingsService.get('torrenting.launch_via_chromium') && DuckieTorrent.getClient().isConnected()) { // fast method when using utorrent api.
          if (window.debug982) console.debug('Adding via TorrentClient.addMagnet API! ', magnet, TRAKT_ID, dlPath, label)
          DuckieTorrent.getClient().addMagnet(magnet, dlPath, label)
          setTimeout(function() {
            DuckieTorrent.getClient().Update(true) // force an update from torrent clients after 1.5 second to show the user that the torrent has been added.
          }, 1500)
        } else {
          if (window.debug982) console.debug('Adding via openURL! ', magnet, TRAKT_ID, dlPath, label)
          openUrl('magnet', magnet)
        }
        $rootScope.$broadcast('torrent:select:' + TRAKT_ID, magnet.getInfoHash())
        // record that this magnet was launched under DuckieTV's control. Used by auto-Stop.
        TorrentHashListService.addToHashList(magnet.getInfoHash())
      },

      launchTorrentByUpload: function(data, infoHash, TRAKT_ID, releaseName, dlPath, label) {
        console.info('Firing Torrent By data upload! ', TRAKT_ID, infoHash, releaseName, dlPath, label)

        if (DuckieTorrent.getClient().isConnected()) { // fast method when using utorrent api.
          if (window.debug982) console.debug('Adding via TorrentClient.addTorrentByUpload API! ', TRAKT_ID, infoHash, releaseName, dlPath, label)
          DuckieTorrent.getClient().addTorrentByUpload(data, infoHash, releaseName, dlPath, label).then(function() {
            $rootScope.$broadcast('torrent:select:' + TRAKT_ID, infoHash)
            // record that this .torrent was launched under DuckieTV's control. Used by auto-Stop.
            TorrentHashListService.addToHashList(infoHash)
          })
          setTimeout(function() {
            DuckieTorrent.getClient().Update(true) // force an update from torrent clients after 1.5 second to show the user that the torrent has been added.
          }, 1500)
        }
      },

      launchTorrentByURL: function(torrentUrl, infoHash, TRAKT_ID, releaseName, dlPath, label) {
        console.info('Firing Torrent By URL! ', torrentUrl, TRAKT_ID, infoHash, releaseName, dlPath, label)

        if (!SettingsService.get('torrenting.launch_via_chromium') && DuckieTorrent.getClient().isConnected()) { // fast method when using utorrent api.
          if (window.debug982) console.debug('Adding via TorrentClient.addTorrentByUrl API! ', torrentUrl, TRAKT_ID, infoHash, releaseName, dlPath, label)
          DuckieTorrent.getClient().addTorrentByUrl(torrentUrl, infoHash, releaseName, dlPath, label).then(function() {
            $rootScope.$broadcast('torrent:select:' + TRAKT_ID, infoHash)
            // record that this .torrent was launched under DuckieTV's control. Used by auto-Stop.
            TorrentHashListService.addToHashList(infoHash)
          })
          setTimeout(function() {
            DuckieTorrent.getClient().Update(true) // force an update from torrent clients after 1.5 second to show the user that the torrent has been added.
          }, 1500)
        } else {
          if (window.debug982) console.debug('Adding via openURL! ', torrentUrl, TRAKT_ID, infoHash, releaseName, dlPath, label)
          openUrl('torrent', torrentUrl)
        }
      },

      initialize: function() {
        var lastFetched = ('trackers.lastFetched' in localStorage) ? new Date(parseInt(localStorage.getItem('trackers.lastFetched'))) : new Date()
        if (('trackers.fallBackList' in localStorage) && lastFetched.getTime() + 2592000000 > new Date().getTime()) {
          // its not been 30 days since the last update, use existing trackers fall back list
          service.trackers = localStorage.getItem('trackers.fallBackList')
          console.info('Fetched trackers fall back list from localStorage.')
        } else {
          // its been 30 days since the last update, time to refresh
          $http.get('https://raw.githubusercontent.com/ngosang/trackerslist/master/trackers_best.txt').then(function(response) {
            // prefix each tracker url with &tr= and strip CRLFs
            var rawTrackers = response.data.split(/\n\n/)
            service.trackers = rawTrackers.map(function(url) {
              return (url) ? '&tr=' + url : ''
            }).join('')
            localStorage.setItem('trackers.fallBackList', service.trackers)
            localStorage.setItem('trackers.lastFetched', new Date().getTime())
            console.info('Updated localStorage with latest trackers fall back list.')
          }, function(error) {
            // oops, something when wrong. provide default if there is no previous save
            if ('trackers.fallBackList' in localStorage) {
              service.trackers = localStorage.getItem('trackers.fallBackList')
              console.warn('Failed to fetch latest trackers fall back list, keeping previous.', error.status, error.statusText)
            } else {
              service.trackers = [
                '&tr=udp://tracker.coppersurfer.tk:6969/announce',
                '&tr=udp://tracker.zer0day.to:1337/announce',
                '&tr=udp://tracker.leechers-paradise.org:6969/announce',
                '&tr=udp://9.rarbg.com:2710/announce'
              ].join('')
              localStorage.setItem('trackers.fallBackList', service.trackers)
              console.warn('Failed to fetch latest trackers fall back list, saving default.', error.status, error.statusText)
            }
          })
        }
        // load jackett engines
        CRUD.Find('Jackett').then(function(results) {
          results.map(function(jackett) {
            service.addJackettEngine(jackett)
          })
        })
      }
    }
    return service
  }
])
  .run(['TorrentSearchEngines', 'SettingsService',
    function(TorrentSearchEngines, SettingsService) {
      TorrentSearchEngines.initialize()
      TorrentSearchEngines.setDefault(SettingsService.get('torrenting.searchprovider'))
      if (SettingsService.get('torrenting.enabled')) {
        var timeoutDelay = 2000 // optional customisation for #1062
        if (localStorage.getItem('custom_default_SE_providers_delay')) {
          timeoutDelay = localStorage.getItem('custom_default_SE_providers_delay')
        }

        // delay for 2 second so that custom clients can register themselves before determining default engine.
        setTimeout(function() {
          var providers = TorrentSearchEngines.getSearchEngines()
          if (!(SettingsService.get('torrenting.searchprovider') in providers)) {
            // auto-config migration, fallback to first provider in the list when we detect an invalid provider.
            console.warn('Invalid search provider detected: ', SettingsService.get('torrenting.searchprovider'), ' defaulting to ', Object.keys(providers)[0])
            SettingsService.set('torrenting.searchprovider', Object.keys(providers)[0])
          }
          TorrentSearchEngines.setDefault(SettingsService.get('torrenting.searchprovider'))
        }, timeoutDelay)
      }
    }
  ])
;
/**
 *  'Generic' torrent search engine scraper for environments where CORS is permitted. (Like node-webkit, chrome extension, phonegap, or when using a CORS proxy)
 *
 *  Usage:
 *      - Instantiate a new GenericTorrentSearchEngine and register it to the TorrentSearchEngines factory by creating a new app.run() block.
 *      - The search engine (SE) will automatically be added in the TorrentDialog directive and become available in settings for auto-selection.
 *      - Each SE should provide at least the properties described below (with the following exceptions):
 *        - the orderby group is optional, include it if you want to support sorting columns (and provider allows for it).
 *        - If the provider supplies magnets in the search page, then the detailsSelectors group is not required, but optional.
 *        - Where the magnet link and/or torrent link are only on a details page, include the detailsSelectors group.
 *
 *  Heavily annotated Example:
 *
 *  DuckieTV.run(["TorrentSearchEngines", "$q", "$http", "$injector", function(TorrentSearchEngines, $q, $http, $injector) {
 *
 *      TorrentSearchEngines.registerSearchEngine('ThePirateBay', new GenericTorrentSearchEngine({ // name, instance
 *          mirror: 'https://thepiratebay.org',                             // base endpoint
 *          mirrorResolver: 'MirrorResolver',                               // Angular class to $inject fetching a mirror
 *          includeBaseURL: true,                                           // Prefix the base url (config.mirror) to detailUrl & torrentUrl
 *          endpoints: {                                                    // endpoints for details and search calls. Needs to be GET
 *              search: '/search/%s/0/%o/0'                                 // use %s to pass in the search query. if the SE supports sorting, use %o to pass in the orderBy parm.
 *          },
 *          selectors: {                                                    // CSS selectors to grab content from search page.
 *              resultContainer: '#searchResult tbody tr',                  // CSS selector to select repeating results.
 *              releasename: ['td:nth-child(2) > div', 'innerText'],        // selector, element attribute, [parser function].
 *              magnetUrl: ['td:nth-child(2) > a', 'href'],                 // if no magnet, leave it out
 *              torrentUrl: ['td:nth-child(2) > a', 'href'],                // if no torrent, leave it out
 *                                                                          // note: if neither, then one or both _must_ be in detailsSelectors
 *              size: ['td:nth-child(2) .detDesc', 'innerText',
 *                  function(innerText) {
 *                      return innerText.split(', ')[1].split(' ')[1];
 *                  }
 *              ],
 *              seeders: ['td:nth-child(3)', 'innerHTML'],
 *              leechers: ['td:nth-child(4)', 'innerHTML'],
 *              detailUrl: ['a.detLink', 'href'],
 *          },
 *          orderby: {                                                      // search-order sorting options.
 *              leechers: {d: '9', a: '10'},                                // if the provider does not support sorting then leave the orderby group out.
 *              seeders: {d: '99', a: '8'},                                 // d: descending, a: ascending
 *              size: {d: '5', a: '6'}                                      // Note: only these three have language translation support.
 *          },
 *          detailsSelectors: {                                             // CSS selectors to grab content from details page.
 *                                                                          Required if magnet/torrent is not in search selectors
 *              detailsContainer: '#detailsframe',                          // CSS selector to select the details container.
 *              magnetUrl: ['div.download a', 'href'],                      // if no magnet, leave it out
 *              torrentUrl: ['div.download a', 'href']                      // if no torrent, leave it out
 *          }
 *      }, $q, $http, $injector));
 *  }]);
 */

function GenericTorrentSearchEngine(config, $q, $http, $injector) { // eslint-disable-line
  var self = this

  var activeRequest = null
  var SettingsService = $injector.get('SettingsService')

  this.config = config

  /**
     * Grab optional overridden url from settings.
     */
  function getUrl(type, param, sortParam) {
    if (('mirrorSettingsKey' in config) && config.mirror != SettingsService.get(config.mirrorSettingsKey)) {
      config.mirror = SettingsService.get(config.mirrorSettingsKey)
    }
    var url = config.mirror + config.endpoints[type]
    // does provider supports search sorting?
    var sortPart = (typeof sortParam !== 'undefined') ? sortParam.split('.') : []
    if (typeof sortParam !== 'undefined' && 'orderby' in config && sortPart.length == 2 && sortPart[0] in config.orderby && sortPart[1] in config.orderby[sortPart[0]]) {
      url = url.replace('%o', config.orderby[sortPart[0]][sortPart[1]])
    }
    return url.replace('%s', encodeURIComponent(param))
  }

  function getPropertyForSelector(parentNode, propertyConfig) {
    if (!propertyConfig || !propertyConfig.length || propertyConfig.length < 2) return null
    var node
    if (propertyConfig[0] === '') {
      node = parentNode
    } else {
      node = parentNode.querySelector(propertyConfig[0])
    }
    // console.debug('search',parentNode,propertyConfig[0],node);
    if (!node) return null
    var propertyValue = node.getAttribute(propertyConfig[1]) !== null ? node.getAttribute(propertyConfig[1]) : node[propertyConfig[1]]
    return propertyConfig.length == 3 && propertyConfig[2] !== null && typeof (propertyConfig[2]) === 'function' ? propertyConfig[2](propertyValue) : propertyValue
  }

  /**
     * Generic search parser that has a selector, a property to fetch from the selector and an optional callback function for formatting/modifying
     */
  function parseSearch(result) {
    var output = []

    if ('isJackett' in config && config.isJackett) {
      // this is a jackett Search Engine
      if (config.useTorznab) {
        // jackett via torznab returns xml
        var x2js = new X2JS({arrayAccessForm: 'property'})
        var jsonObj = x2js.xml2json((new DOMParser()).parseFromString(result.data, 'text/xml'))
        if ('rss' in jsonObj && 'channel' in jsonObj.rss && 'item' in jsonObj.rss.channel) {
          // console.debug(config.name,jsonObj.rss.channel.item_asArray);
          jsonObj.rss.channel.item_asArray.map(function(data) {
            var seeds = null

            var peers = null
            data.attr_asArray.map(function(attr) {
              if (attr._name === 'seeders') {
                seeds = attr._value
              }
              if (attr._name === 'peers') {
                peers = attr._value
              }
            })
            var out = {
              releasename: data.title,
              size: (parseFloat(data.size) / 1000 / 1000).toFixed(2) + ' MB',
              seeders: (seeds != null) ? seeds : 'n/a',
              leechers: (peers != null) ? peers : 'n/a',
              detailUrl: data.comments,
              noMagnet: true,
              noTorrent: true
            }
            var magnet = null
            if (data.link.indexOf('magnet:?') === 0) {
              magnet = data.link
            }
            var magnetHash = null
            if (magnet) {
              out.magnetUrl = magnet
              out.noMagnet = false
              magnetHash = out.magnetUrl.match(/([0-9ABCDEFabcdef]{40})/)
            }
            var torrent = null
            if (data.link.indexOf('http') === 0) {
              torrent = data.link
            }
            if (torrent) {
              out.torrentUrl = torrent
              out.noTorrent = false
            } else if (magnetHash && magnetHash.length) {
              out.torrentUrl = 'http://itorrents.org/torrent/' + magnetHash[0].toUpperCase() + '.torrent?title=' + encodeURIComponent(out.releasename.trim())
              out.noTorrent = false
            }
            output.push(out)
          })
        }
      } else {
        // jackett via Admin/search returns json
        if ('Results' in result.data && result.data.Results !== output) {
          // console.debug(config.name,result.data.Results);
          result.data.Results.map(function(data) {
            var out = {
              releasename: data.Title,
              size: (parseFloat(data.Size) / 1000 / 1000).toFixed(2) + ' MB',
              seeders: (data.Seeders != null) ? data.Seeders : 'n/a',
              leechers: (data.Peers != null) ? data.Peers : 'n/a',
              detailUrl: data.Details,
              noMagnet: true,
              noTorrent: true
            }
            var magnet = data.MagnetUri
            var magnetHash = null
            if (magnet) {
              out.magnetUrl = magnet
              out.noMagnet = false
              magnetHash = out.magnetUrl.match(/([0-9ABCDEFabcdef]{40})/)
            }
            var torrent = data.Link
            if (torrent) {
              out.torrentUrl = torrent
              out.noTorrent = false
            } else if (magnetHash && magnetHash.length) {
              out.torrentUrl = 'http://itorrents.org/torrent/' + magnetHash[0].toUpperCase() + '.torrent?title=' + encodeURIComponent(out.releasename.trim())
              out.noTorrent = false
            }
            output.push(out)
          })
        }
      }
      // console.debug(config.name,output);
      return output
    } else {
      // this is a standard (or custom) Search Engine
      var parser = new DOMParser()
      var doc = parser.parseFromString(result.data, 'text/html')
      var selectors = config.selectors

      if ('loginRequired' in config && config.loginRequired) {
        var loginTest = doc.querySelectorAll(config.loginTestSelector)
        if (loginTest.length > 0) {
          if (confirm('Not logged in @ ' + config.mirror + '. Do you want to open a new window so that you can login?')) {
            window.open(config.mirror + config.loginPage)
          }
          throw 'Not logged in!'
        }
      }

      var results = doc.querySelectorAll(selectors.resultContainer)
      // console.debug('searchcontainer',selectors.resultContainer,results);

      for (var i = 0; i < results.length; i++) {
        var releasename = getPropertyForSelector(results[i], selectors.releasename)
        if (releasename === null) continue

        var seed = getPropertyForSelector(results[i], selectors.seeders)
        var leech = getPropertyForSelector(results[i], selectors.leechers)
        seed = (seed != null) ? seed.replace(',', '') : 'n/a'
        leech = (leech != null) ? leech.replace(',', '') : 'n/a'

        var out = {
          releasename: releasename.trim(),
          size: sizeToMB(getPropertyForSelector(results[i], selectors.size)),
          seeders: seed,
          leechers: leech,
          detailUrl: (config.includeBaseURL ? config.mirror : '') + getPropertyForSelector(results[i], selectors.detailUrl),
          noMagnet: true,
          noTorrent: true
        }

        var magnet = getPropertyForSelector(results[i], selectors.magnetUrl)
        var torrent = getPropertyForSelector(results[i], selectors.torrentUrl)
        var magnetHash = null

        if (magnet) {
          out.magnetUrl = magnet
          out.noMagnet = false
          magnetHash = out.magnetUrl.match(/([0-9ABCDEFabcdef]{40})/)
        }

        if (torrent) {
          out.torrentUrl = (torrent.startsWith('http')) ? torrent : config.mirror + torrent
          out.noTorrent = false
        } else if (magnetHash && magnetHash.length) {
          out.torrentUrl = 'http://itorrents.org/torrent/' + magnetHash[0].toUpperCase() + '.torrent?title=' + encodeURIComponent(out.releasename.trim())
          out.noTorrent = false
        }

        // if there is no magnet and/or no torrent, check of detailsSelectors has been provided.
        if ('detailsSelectors' in config) {
          if ('magnetUrl' in config.detailsSelectors) {
            out.noMagnet = false
          }
          if ('torrentUrl' in config.detailsSelectors) {
            out.noTorrent = false
          }
        }

        output.push(out)
      }

      // console.debug('parseSearch',config.mirror, output);
      return output
    }
  }

  /**
     * Generic details parser that has a selector, a property to fetch from the selector and an optional callback function for formatting/modifying
     */
  function parseDetails(data, releaseName) {
    var output = {}
    if ('detailsSelectors' in config) {
      var parser = new DOMParser()
      var doc = parser.parseFromString(data.data, 'text/html')
      var selectors = config.detailsSelectors
      var container = doc.querySelector(selectors.detailsContainer)
      // console.debug('detailscontainer',container)
      var magnet = getPropertyForSelector(container, selectors.magnetUrl)
      var magnetHash = null
      if (magnet) {
        output.magnetUrl = magnet
        magnetHash = output.magnetUrl.match(/([0-9ABCDEFabcdef]{40})/)
      }
      var torrent = getPropertyForSelector(container, selectors.torrentUrl)
      if (torrent) {
        output.torrentUrl = (torrent.startsWith('http')) ? torrent : config.mirror + torrent
      } else if (magnetHash && magnetHash.length) {
        output.torrentUrl = 'http://itorrents.org/torrent/' + magnetHash[0].toUpperCase() + '.torrent?title=' + encodeURIComponent(releaseName.trim())
      }
    }
    // console.debug('parseDetails', config.mirror, output);
    return output
  }

  this.cancelActiveRequest = function() {
    if (activeRequest) {
      activeRequest.resolve()
    }
  }

  /**
     * Execute a generic torrent search, parse the results and return them as an array
     */
  this.search = function(what, noCancel, orderBy) {
    what = what.replace(/'/g, '')
    var d = $q.defer()
    if (noCancel !== true && activeRequest) {
      activeRequest.resolve()
    }
    activeRequest = $q.defer()
    this.executeSearch(what, activeRequest, orderBy).then(function(response) {
      // console.log("Torrent search executed!", response);
      try {
        var result = parseSearch(response)
        d.resolve(result)
      } catch (E) {
        d.reject(E)
      }
    }, function(err) {
      if (err.status > 300) {
        if (err.status == 404) {
          d.resolve([])
        } else if (config.mirrorResolver && config.mirrorResolver !== null) {
          $injector.get(config.mirrorResolver).findMirror().then(function(result) {
            // console.log("Resolved a new working mirror!", result);
            config.mirror = result
            return self.search(what, undefined, orderBy)
          }, function(err) {
            d.reject(err)
          })
        }
      }
    })
    return d.promise
  }

  this.executeSearch = function(what, timeout, sortBy) {
    var payload
    if (!timeout) {
      timeout = $q.defer()
    }

    if ('isJackett' in config && config.isJackett) {
      // this is a jackett Search Engine
      if (config.useTorznab) {
        // jacket via torznab
        if (('apiVersion' in config && config.apiVersion == 1) || !('apiVersion' in config)) {
          // api 1
          payload = what.trim().replace(/\s/g, '+')
        } else {
          // api 2
          payload = '?t=search&cat=&apikey=' + config.apiKey + '&q=' + what.trim().replace(/\s/g, '+')
        }
        return $http({
          method: 'GET',
          url: config.torznab + payload,
          cache: false,
          timeout: timeout.promise,
          cancel: timeout
        })
      } else {
        // jackett via Admin/search
        if (('apiVersion' in config && config.apiVersion == 1) || !('apiVersion' in config)) {
          // api 1
          payload = 'Query=' + what.trim().replace(/\s/g, '+') + '&Category=&Tracker=' + config.tracker
          return $http.post(config.mirror, payload, {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
              'cache': false,
              'timeout': timeout.promise,
              'cancel': timeout
            }
          })
        } else {
          // api 2 (0.8.136.0)
          var trackerid = (config.tracker == 'all') ? '' : '&Tracker%5B%5D=' + config.tracker
          payload = '?apikey=' + config.apiKey + '&Query=' + what.trim().replace(/\s/g, '%20') + trackerid
          return $http({
            method: 'GET',
            url: config.mirror + payload,
            cache: false,
            timeout: timeout.promise,
            cancel: timeout
          })
        }
      }
    } else {
      // this is a standard Search Engine
      if (!sortBy) {
        sortBy = 'seeders.d'
      }

      return $http({
        method: 'GET',
        url: getUrl('search', what, sortBy),
        cache: false,
        timeout: timeout.promise,
        cancel: timeout
      })
    }
  }

  /**
     * Get SE details page with the supplied url
     * the supplied releaseName is used to build itorrents.org url
     * returns
     * {
     *    magnetUrl: "magnet:?xt=urn:btih:<hash>", // if available
     *    torrentUrl: "<torrentlink>", // if available
     *    torrentUrl: "http://itorrents.org/torrent/<hash>.torrent?title=<releaseName>" // if no torrent but has magnet
     * }
     */
  this.getDetails = function(url, releaseName) {
    return $http({
      method: 'GET',
      url: url,
      cache: true
    }).then(function(response) {
      return parseDetails(response, releaseName)
    })
  }

  function sizeToMB(size) {
    size = (typeof size !== 'undefined' && size !== null && size !== '') ? size.replace(',', '').match(/[0-9.]{1,}[\W]{0,}[KTMGmgibBytes]{2,}/)[0] : '0 MB'
    var sizeA = (size.replace(',', '').split(/\s{1}/)) // size split into value and unit
    var newSize = null // size converted to MB

    switch (sizeA[1].toUpperCase()) {
      case 'B':
      case 'BYTES':
        newSize = (parseFloat(sizeA[0]) / 1000 / 1000).toFixed(2)
        break
      case 'KB':
        newSize = (parseFloat(sizeA[0]) / 1000).toFixed(2)
        break
      case 'MB':
        newSize = (parseFloat(sizeA[0])).toFixed(2)
        break
      case 'GB':
        newSize = (parseFloat(sizeA[0]) * 1000).toFixed(2)
        break
      case 'TB':
        newSize = (parseFloat(sizeA[0]) * 1000 * 1000).toFixed(2)
        break
      case 'KIB':
        newSize = ((parseFloat(sizeA[0]) * 1024) / 1000 / 1000).toFixed(2)
        break
      case 'MIB':
        newSize = ((parseFloat(sizeA[0]) * 1024 * 1024) / 1000 / 1000).toFixed(2)
        break
      case 'GIB':
        newSize = ((parseFloat(sizeA[0]) * 1024 * 1024 * 1024) / 1000 / 1000).toFixed(2)
        break
      case 'TIB':
        newSize = ((parseFloat(sizeA[0]) * 1024 * 1024 * 1024 * 1024) / 1000 / 1000).toFixed(2)
        break
      default:
        return size
    }
    return newSize + ' MB'
  }
}
;
/**
 * Automatic mirror resolver for ThePirateBay by utilizing proxy-bay.app
 */
DuckieTV.factory('ThePirateBayMirrorResolver', ['$q', '$http', '$injector',
  function($q, $http, $injector) {
    var $rootScope = $injector.get('$rootScope')

    var maxAttempts = 3

    var endpoints = {
      thepiratebay: 'https://proxy-bay.ink/'
    }

    /**
     * Switch between search and details
     */
    function getUrl(type) {
      return endpoints[type]
    }

    /**
     * Find a random mirror from proxybay.app
     */
    function parsePirateBayProxyList(result) {
      var parser = new DOMParser()
      var doc = parser.parseFromString(result.data, 'text/html')
      var resultList = doc.querySelectorAll('td.site a[rel=nofollow]')
      return resultList[Math.floor(Math.random() * resultList.length)].href
    }

    /**
     * When a TPB test search has been executed, verify that at least one magnet link is available in the
     * expected layout. (Some proxies proxy your magnet links so they can track them, we don't want that.)
     */
    function parseTPBTestSearch(result, allowUnsafe) {
      return allowUnsafe ? true : result.data.indexOf('magnet:') > -1
    }

    var service = {
      /**
       * Find a random mirror for ThePirateBay and return the promise when
       * one is found and verified. If a valid working server is not found within x tries, it fails.
       * Provides up-to-date status messages via mirrorresolver:status while doing that
       */
      findTPBMirror: function(attempt) {
        attempt = attempt || 1
        $rootScope.$broadcast('tpbmirrorresolver:status', 'Finding a random TPB Mirror, attempt ' + attempt)
        var d = $q.defer()
        $http({ // fetch the document that gives a mirror
          method: 'GET',
          url: getUrl('thepiratebay'),
          cache: false
        }).then(function(response) {
          // parse the response
          var location = parsePirateBayProxyList(response)
          $rootScope.$broadcast('tpbmirrorresolver:status', 'Found ThePirateBay mirror! ' + location + ' Verifying if it uses magnet links.')
          // verify that the mirror works by executing a test search, otherwise try the process again
          service.verifyTPBMirror(location).then(function(location) {
            // console.debug("Mirror uses magnet links!", location);
            d.resolve(location)
          }, function(err) {
            if (attempt < maxAttempts) {
              if (err.status) { $rootScope.$broadcast('tpbmirrorresolver:status', 'Mirror does not do magnet links.. trying another one.') }
              d.resolve(service.findTPBMirror(attempt + 1))
            } else {
              $rootScope.$broadcast('tpbmirrorresolver:status', 'Could not resolve a working mirror in ' + maxAttempts + ' tries. TPB is probably down.')
              d.reject('Could not resolve a working mirror in ' + maxAttempts + ' tries. TPB is probably down.')
            }
          })
        }, function(err) {
          console.error('error!')
          d.reject(err)
        })
        return d.promise
      },
      /**
       * alias for GenericTorrentSearchEngine.js
       */
      findMirror: function() {
        return service.findTPBMirror()
      },
      /**
       * Verify that a specific TPB mirror is working and using magnet links by executing a test search
       * Parses the results and checks that magnet links are available like they are on TPB.
       * Some mirrors will not provide direct access to magnet links so we filter those out
       */
      verifyTPBMirror: function(location, maxTries) {
        if (maxTries) {
          maxAttempts = maxTries
        }

        $rootScope.$broadcast('tpbmirrorresolver:status', 'Verifying if mirror is using magnet links!: ' + location)
        var q = $q.defer()
        var slash = ''

        if (location.substr(location.length - 1) !== '/') {
          slash = '/'
        }

        var testLocation = location + slash + 'search/test/0/7/0'
        $http({
          method: 'GET',
          url: testLocation
        }).then(function(response) {
          $rootScope.$broadcast('tpbmirrorresolver:status', 'Results received, parsing')
          if (parseTPBTestSearch(response, $rootScope.getSetting('proxy.allowUnsafe'))) {
            $rootScope.$broadcast('tpbmirrorresolver:status', 'Yes it does!')
            q.resolve(location)
          } else {
            $rootScope.$broadcast('tpbmirrorresolver:status', 'This is a mirror that intercepts magnet links. bypassing.')
            q.reject(location)
          }
        }, function(err) {
          $rootScope.$broadcast('tpbmirrorresolver:status', 'error! HTTP Status: ' + angular.toJson(err.status))
          q.reject(err)
        })
        return q.promise
      }
    }

    return service
  }
])
;
DuckieTV.run(['TorrentSearchEngines', 'SettingsService', '$q', '$http', '$injector',
  function(TorrentSearchEngines, SettingsService, $q, $http, $injector) {
    if (SettingsService.get('torrenting.enabled')) {
      TorrentSearchEngines.registerSearchEngine('ThePirateBay', new GenericTorrentSearchEngine({
        mirror: SettingsService.get('mirror.ThePirateBay'),
        mirrorSettingsKey: 'ThePirateBay.mirror',
        mirrorResolver: 'ThePirateBayMirrorResolver',
        includeBaseURL: false,
        endpoints: {
          search: '/search/%s/0/%o/0'
        },
        selectors: {
          resultContainer: '#searchResult tbody tr',
          releasename: ['td:nth-child(2) > div', 'innerText'],
          magnetUrl: ['td:nth-child(2) > a', 'href'],
          size: ['td:nth-child(2) .detDesc', 'innerText',
            function(text) {
              return text.split(', ')[1].split(' ')[1].replace('i', '')
            }
          ],
          seeders: ['td:nth-child(3)', 'innerHTML'],
          leechers: ['td:nth-child(4)', 'innerHTML'],
          detailUrl: ['a.detLink', 'href']
        },
        orderby: {
          leechers: {d: '9', a: '10'},
          seeders: {d: '99', a: '8'},
          size: {d: '5', a: '6'}
        }
      }, $q, $http, $injector))
    }
  }
])
;
DuckieTV.run(['TorrentSearchEngines', 'SettingsService', '$q', '$http', '$injector',
  function(TorrentSearchEngines, SettingsService, $q, $http, $injector) {
    if (SettingsService.get('torrenting.enabled')) {
      TorrentSearchEngines.registerSearchEngine('1337x', new GenericTorrentSearchEngine({
        mirror: SettingsService.get('mirror.1337x'),
        mirrorResolver: null,
        includeBaseURL: true,
        endpoints: {
          search: '/sort-search/%s/%o/1/'
        },
        selectors: {
          resultContainer: 'tr',
          releasename: ['td.coll-1 a:nth-of-type(2)', 'innerText'],
          seeders: ['td.coll-2', 'innerText'],
          leechers: ['td.coll-3', 'innerText'],
          size: ['td.coll-4', 'innerHTML',
            function(text) {
              var textPart = text.split('<')
              return textPart[0]
            }
          ],
          detailUrl: ['td.coll-1 a:nth-of-type(2)', 'href']
        },
        detailsSelectors: {
          detailsContainer: 'div.no-top-radius',
          magnetUrl: ['ul li a[href^="magnet:?"]', 'href'],
          torrentUrl: ['ul li a[href^="http://itorrents.org/"]', 'href']
        },
        orderby: {
          seeders: {d: 'seeders/desc', a: 'seeders/asc'},
          leechers: {d: 'leechers/desc', a: 'leechers/asc'},
          size: {d: 'size/desc', a: 'size/asc'}
        }
      }, $q, $http, $injector))
    }
  }
])
;
DuckieTV.run(['TorrentSearchEngines', 'SettingsService', '$q', '$http', '$injector',
  function(TorrentSearchEngines, SettingsService, $q, $http, $injector) {
    if (SettingsService.get('torrenting.enabled')) {
      TorrentSearchEngines.registerSearchEngine('ETag', new GenericTorrentSearchEngine({
        mirror: SettingsService.get('mirror.ETag'),
        mirrorResolver: null,
        includeBaseURL: true,
        endpoints: {
          search: '/search/?search=%s&srt=%o&new=1&x=0&y=0'
        },
        selectors: {
          resultContainer: 'tr[class^="tl"]',
          releasename: ['a[href^="/torrent/"]', 'innerText'],
          magnetUrl: ['a[href^="magnet:?xt="]', 'href'],
          seeders: ['td.sy, td.sn', 'innerText',
            function(text) {
              return (text == null) ? 0 : text
            }
          ],
          leechers: ['td.ly, td.ln', 'innerText',
            function(text) {
              return (text == null) ? 0 : text
            }
          ],
          size: ['td:nth-last-of-type(4)', 'innerText'],
          detailUrl: ['a[href^="/torrent/"]', 'href']
        },
        orderby: {
          seeders: {d: 'seeds&order=desc', a: 'seeds&order=desc'},
          leechers: {d: 'leechers&order=desc', a: 'leechers&order=desc'},
          size: {d: 'size&order=desc', a: 'size&order=desc'}
        }
      }, $q, $http, $injector))
    }
  }
])
;
DuckieTV.run(['TorrentSearchEngines', 'SettingsService', '$q', '$http', '$injector',
  function(TorrentSearchEngines, SettingsService, $q, $http, $injector) {
    if (SettingsService.get('torrenting.enabled')) {
      TorrentSearchEngines.registerSearchEngine('EXT', new GenericTorrentSearchEngine({
        mirror: SettingsService.get('mirror.EXT'),
        mirrorResolver: null,
        includeBaseURL: true,
        endpoints: {
          search: '/search?%o&q=%s'
        },
        selectors: {
          resultContainer: 'table.table-striped > tbody > tr',
          releasename: ['td:nth-child(1) div a', 'innerText'],
          size: ['td:nth-child(2)', 'innerText'],
          seeders: ['span.text-success', 'innerText'],
          leechers: ['span.text-danger', 'innerText'],
          detailUrl: ['td:nth-child(1) div a', 'href']
        },
        detailsSelectors: {
          detailsContainer: 'div.pt-2',
          magnetUrl: ['a[href^="magnet:?xt="]', 'href']
        },
        orderby: {
          leechers: {d: 'order=leech&sort=desc', a: 'order=leech&sort=asc'},
          seeders: {d: 'order=seed&sort=desc', a: 'order=seed&sort=asc'},
          size: {d: 'order=size&sort=desc', a: 'order=size&sort=asc'}
        }
      }, $q, $http, $injector))
    }
  }
])
;
DuckieTV.run(['TorrentSearchEngines', 'SettingsService', '$q', '$http', '$injector',
  function(TorrentSearchEngines, SettingsService, $q, $http, $injector) {
    if (SettingsService.get('torrenting.enabled')) {
      TorrentSearchEngines.registerSearchEngine('EzTV.ag', new GenericTorrentSearchEngine({
        mirror: SettingsService.get('mirror.EzTVag'),
        mirrorResolver: null,
        includeBaseURL: true,
        endpoints: {
          search: '/search/%s'
        },
        selectors: {
          resultContainer: 'table.forum_header_border tr.forum_header_border',
          releasename: ['td > a.epinfo', 'innerText'],
          magnetUrl: ['td > a.magnet', 'href'],
          torrentUrl: ['td:nth-child(3) a:nth-child(2)', 'href'],
          size: ['td:nth-child(4)', 'innerText'],
          seeders: ['td:nth-child(6)', 'innerText'],
          leechers: ['td:nth-child(6)', 'innerText', function(a) {
            return 'n/a'
          }],
          detailUrl: ['td.forum_thread_post > a.epinfo', 'href']
        }
      }, $q, $http, $injector))
    }
  }
])
;
DuckieTV.run(["TorrentSearchEngines", "SettingsService", "$q", "$http", "$injector",
    function(TorrentSearchEngines, SettingsService, $q, $http, $injector) {
        if (SettingsService.get('torrenting.enabled')) {
            TorrentSearchEngines.registerSearchEngine('Idope', new GenericTorrentSearchEngine({
                mirror: SettingsService.get('mirror.Idope'),
                mirrorResolver: null,
                includeBaseURL: true,
                endpoints: {
                    search: '/torrent-list/%s/?&o=%o'
                },
                selectors: {
                    resultContainer: 'div.resultdiv',
                    releasename: ['div.resultdivtopname', 'innerText'],
                    seeders: ['div.resultdivbottonseed', 'innerText'],
                    leechers: ['div.resultdivbottonseed', 'innerText',
                        function(text) {
                            return '0';
                        }
                    ],
                    size: ['div.resultdivbottonlength', 'innerText'],
                    detailUrl: ['div.resultdivtop a', 'href'],
                    magnetUrl: ['.hideinfohash', 'innerText',
                        function(href) {
                            var magnetHash = href.match(/([0-9ABCDEFabcdef]{40})/);
                            return 'magnet:?xt=urn:btih:' + magnetHash[0] + TorrentSearchEngines.trackers;
                        }
                    ]
                },
                orderby: {
                    seeders: {
                        d: '-1',
                        a: '1'
                    },
                    size: {
                        d: '-2',
                        a: '2'
                    }
                }
            }, $q, $http, $injector));
        }

    }
]);
;
DuckieTV.run(['TorrentSearchEngines', 'SettingsService', '$q', '$http', '$injector',
  function(TorrentSearchEngines, SettingsService, $q, $http, $injector) {
    if (SettingsService.get('torrenting.enabled')) {
      TorrentSearchEngines.registerSearchEngine('IsoHunt2', new GenericTorrentSearchEngine({
        mirror: SettingsService.get('mirror.IsoHunt2'),
        mirrorResolver: null,
        includeBaseURL: true,
        endpoints: {
          search: '/torrent/?ihq=%s&iht=0&verified=0'
        },
        selectors: {
          resultContainer: 'table > tbody > tr[data-key="0"]',
          releasename: ['td.title-row > a[href^="/"] > span', 'innerText'],
          size: ['td.size-row', 'innerText'],
          seeders: ['td.sn', 'innerText'],
          leechers: ['td.sn', 'innerText',
            function(text) {
              return 'n/a'
            }
          ],
          detailUrl: ['td.title-row > a[href^="/"]', 'href']
        },
        detailsSelectors: {
          detailsContainer: 'div[class="row mt"]',
          magnetUrl: ['a:nth-of-type(2)', 'href',
            function(shortlink) {
              return decodeURIComponent(shortlink.replace('https://mylink.cx/?url=', ''))
            }
          ]
        }
      }, $q, $http, $injector))
    }
  }
])
;
DuckieTV.run(['TorrentSearchEngines', 'SettingsService', '$q', '$http', '$injector',
  function(TorrentSearchEngines, SettingsService, $q, $http, $injector) {
    if (SettingsService.get('torrenting.enabled')) {
      TorrentSearchEngines.registerSearchEngine('KATws', new GenericTorrentSearchEngine({
        mirror: SettingsService.get('mirror.KATws'),
        mirrorResolver: null,
        includeBaseURL: true,
        endpoints: {
          search: '/usearch/%s/?%o'
        },
        selectors: {
          resultContainer: 'table.data tr[id]',
          releasename: ['a.cellMainLink', 'innerText'],
          size: ['td:nth-child(2)', 'innerText'],
          seeders: ['td:nth-child(4)', 'innerText',
              function(text) {
                  return (text == 'N/A') ? null : text;
              }
          ],
          leechers: ['td:nth-child(5)', 'innerText',
              function(text) {
                  return (text == 'N/A') ? null : text;
              }
          ],
          magnetUrl: ['td:nth-child(1) > div > a[data-download=""]', 'href',
              function(href) {
                  var decodedURI = decodeURIComponent(href)
                  return decodedURI.substring(href.indexOf('url=') + 4);
              }
          ],
          detailUrl: ['a.cellMainLink ', 'href']
        },
        orderby: {
          age: {d: 'field=time_add&sorder=desc', a: 'field=time_add&sorder=asc'},
          leechers: {d: 'field=leechers&sorder=desc', a: 'field=leechers&sorder=asc'},
          seeders: {d: 'field=seeders&sorder=desc', a: 'field=seeders&sorder=asc'},
          size: {d: 'field=size&sorder=desc', a: 'field=size&sorder=asc'}
        }
      }, $q, $http, $injector))
    }
  }
])
;
DuckieTV.run(['TorrentSearchEngines', 'SettingsService', '$q', '$http', '$injector',
  function(TorrentSearchEngines, SettingsService, $q, $http, $injector) {
    if (SettingsService.get('torrenting.enabled')) {
      TorrentSearchEngines.registerSearchEngine('Knaben', new GenericTorrentSearchEngine({
        mirror: SettingsService.get('mirror.Knaben'),
        mirrorResolver: null,
        includeBaseURL: false,
        endpoints: {
          search: '/search/%s/0/1/%o'
        },
        selectors: {
          resultContainer: 'tr[title^="Cached "]',
          releasename: ['td:nth-child(2) a', 'innerText'],
          magnetUrl: ['td:nth-child(2) a', 'href'],
          size: ['td:nth-child(3)', 'innerText'],
          seeders: ['td:nth-child(5)', 'innerText'],
          leechers: ['td:nth-child(6)', 'innerText'],
          detailUrl: ['td:last-child a', 'href']
        },
        orderby: {
          age: {d: '+date', a: '-date'},
          leechers: {d: '+peers', a: '-peers'},
          seeders: {d: '+seeders', a: '-seeders'},
          size: {d: '+bytes', a: '-bytes'}
        }
      }, $q, $http, $injector))
    }
  }
])
;
DuckieTV.run(['TorrentSearchEngines', 'SettingsService', '$q', '$http', '$injector',
  function(TorrentSearchEngines, SettingsService, $q, $http, $injector) {
    if (SettingsService.get('torrenting.enabled')) {
      TorrentSearchEngines.registerSearchEngine('LimeTorrents', new GenericTorrentSearchEngine({
        mirror: SettingsService.get('mirror.LimeTorrents'),
        mirrorResolver: null,
        includeBaseURL: true,
        endpoints: {
          search: '/search/all/%s/%o'
        },
        selectors: {
          resultContainer: 'tr[bgcolor^="#F"]',
          releasename: ['td div a:nth-child(2)', 'innerText'],
          seeders: ['td:nth-child(4)', 'innerText'],
          leechers: ['td:nth-child(5)', 'innerText'],
          size: ['td:nth-child(3)', 'innerText'],
          detailUrl: ['td div a:nth-child(2)', 'href']
        },
        detailsSelectors: {
          detailsContainer: 'div.torrentinfo',
          magnetUrl: ['a[title$="agnet"]', 'href'],
          torrentUrl: ['a[title$="orrent"]', 'href']
        },
        orderby: {
          seeders: {d: 'seeds/1/', a: 'seeds/1/'},
          size: {d: 'size/1/', a: 'size/1/'}
        }
      }, $q, $http, $injector))
    }
  }
])
;
DuckieTV.run(['TorrentSearchEngines', 'SettingsService', '$q', '$http', '$injector',
  function(TorrentSearchEngines, SettingsService, $q, $http, $injector) {
    if (SettingsService.get('torrenting.enabled')) {
      TorrentSearchEngines.registerSearchEngine('Nyaa', new GenericTorrentSearchEngine({
        mirror: SettingsService.get('mirror.Nyaa'),
        mirrorResolver: null,
        includeBaseURL: true,
        endpoints: {
          search: '/?q=%s&f=0&c=0_0%o'
        },
        selectors: {
          resultContainer: 'tr',
          releasename: ['td:nth-of-type(2) a:last-of-type', 'innerText'],
          magnetUrl: ['td:nth-of-type(3) a[href^="magnet:?"]', 'href'],
          torrentUrl: ['td:nth-of-type(3) a[href$=".torrent"]', 'href'],
          size: ['td:nth-of-type(4)', 'innerText'],
          seeders: ['td:nth-of-type(6)', 'innerText'],
          leechers: ['td:nth-of-type(7)', 'innerText'],
          detailUrl: ['td:nth-of-type(2) a:last-of-type', 'href']
        },
        orderby: {
          leechers: {d: '&s=leechers&o=desc', a: '&s=leechers&o=asc'},
          seeders: {d: '&s=seeders&o=desc', a: '&s=seeders&o=asc'},
          size: {d: '&s=size&o=desc', a: '&s=size&o=asc'}
        }
      }, $q, $http, $injector))
    }
  }
])
;
/**
 * RARBG.com API interface via torrentapi.org..
 * Fetches list of torrent results and tries to fetch the magnet links for an episode.
 * docs: https://torrentapi.org/apidocs_v2.txt?app_id=DuckieTV
 */
DuckieTV.factory('RarBG', ['SettingsService', '$q', '$http',
  function(SettingsService, $q, $http) {
    var activeSearchRequest = false

    var activeTokenRequest = false

    var endpoint = SettingsService.get('mirror.RarBG')

    var endpoints = {
      search: 'token=%s&mode=search&search_string=%s&sort=%o&limit=25&format=json_extended',
      token: 'get_token=get_token&format=json_extended'
    }

    var getUrl = function(type, param, param2, param3) {
      var out = endpoint + endpoints[type].replace('%s', escape(param))
      out = (param2 !== undefined) ? out.replace('%s', escape(param2)) : out
      if (param3 !== undefined) {
        var sortPart = param3.split('.')
        return out.replace('%o', escape(service.config.orderby[sortPart[0]][sortPart[1]]))
      } else {
        return out
      }
    }

    var parsers = {
      search: function(result) {
        var output = []
        if (result.data.error_code) {
          switch (result.data.error_code) {
            case 20: // No results found
              if (result.data.rate_limit) {
                console.warn('Error [%s], Rate Limit=%s', result.data.error_code, result.data.rate_limit)
                return 5
              }
              return []
            case 4: // Invalid token. Use get_token for a new one!
              return 4
            case 5: // Too many requests per second. Maximum requests allowed are 1req/2sec Please try again later!
              console.warn('Error [%s], Reason [%s]', result.data.error_code, result.data.error)
              return 5
            default:
              console.warn('Error [%s], Reason [%s]', result.data.error_code, result.data.error)
              return []
          }
        }
        result.data.torrent_results.map(function(hit) {
          var out = {
            magnetUrl: hit.download,
            noMagnet: false,
            noTorrent: true,
            releasename: hit.title,
            size: (hit.size / 1024 / 1024).toFixed(2) + ' MB',
            seeders: hit.seeders,
            leechers: hit.leechers,
            detailUrl: hit.info_page + "&app_id=DuckieTV"
          }

          var magnetHash = out.magnetUrl.match(/([0-9ABCDEFabcdef]{40})/)
          if (magnetHash && magnetHash.length) {
            out.torrentUrl = 'http://itorrents.org/torrent/' + magnetHash[0].toUpperCase() + '.torrent?title=' + encodeURIComponent(out.releasename.trim())
            out.noTorrent = false
            output.push(out)
          }
        })
        return output
      },

      token: function(result) {
        return result.data
      }

    }

    /**
     * Promise requests with built in delay to avoid the RarBG API's 1req/2sec frequency limit
     */
    var nextRequest = new Date().getTime()

    var promiseRequest = function(type, param, param2, param3, promise, extraDelay) {
      var url = getUrl(type, param, param2, param3)
      return $q(function(resolve, reject) {
        var timeout = (type === 'token') ? 5000 : 5000 + extraDelay
        nextRequest = nextRequest + timeout
        setTimeout(function() {
          $http.get(url, {
            timeout: promise || 120000,
            cache: false
          }).then(function(result) {
            nextRequest = new Date().getTime()
            resolve(parsers[type](result))
          }, function(err) {
            throw 'Error ' + err.status + ':' + err.statusText
          })
        }, nextRequest - new Date().getTime())
      })
    }

    getToken = function(isTokenExpired) {
      isTokenExpired = (isTokenExpired == undefined) ? false : isTokenExpired
      if (isTokenExpired) {
        service.activeToken = null
        activeTokenRequest = false
      }
      if (!activeTokenRequest && !service.activeToken) {
        activeTokenRequest = promiseRequest('token').then(function(token) {
          service.activeToken = token.token
          return token.token
        })
      } else if (service.activeToken) {
        return $q(function(resolve) {
          return resolve(service.activeToken)
        })
      }
      return activeTokenRequest
    }

    var service = {
      activeToken: null,
      config: {
        orderby: {
          leechers: {d: 'leechers', a: 'leechers'},
          seeders: {d: 'seeders', a: 'seeders'}
        }
      },
      cancelActiveRequest: function() {
        if (activeSearchRequest) {
          activeSearchRequest.resolve()
        }
      },
      search: function(what, noCancel, orderBy, isTokenExpired, extraDelay) {
        extraDelay = (extraDelay == undefined) ? 0 : 5000
        noCancel = (noCancel == undefined) ? false : noCancel
        orderBy = (orderBy == undefined) ? 'seeders.d' : orderBy
        isTokenExpired = (isTokenExpired == undefined) ? false : isTokenExpired
        if (noCancel === false) {
          service.cancelSearch()
        }
        if (!activeSearchRequest) {
          activeSearchRequest = $q.defer()
          return getToken(isTokenExpired).then(function(token) {
            return promiseRequest('search', token, what, orderBy, activeSearchRequest.promise, extraDelay).then(function(results) {
              if (activeSearchRequest && activeSearchRequest.resolve) {
                activeSearchRequest.resolve(true)
              }
              activeSearchRequest = false
              if (results === 4) { // token expired
                return service.search(what, true, orderBy, true)
              } else if (results === 5) { // retry later
                return service.search(what, false, orderBy, false , true)
              }
              return results
            })
          })
        } else {
          // delay search until current one is complete
          return activeSearchRequest.promise.then(function() {
            return service.search(what, true, orderBy)
          })
        }
      },
      cancelSearch: function() {
        if (activeSearchRequest && activeSearchRequest.resolve) {
          activeSearchRequest.reject('search abort')
          activeSearchRequest = false
        }
      }
    }
    return service
  }
])

DuckieTV.run(['TorrentSearchEngines', 'SettingsService', 'RarBG',
  function(TorrentSearchEngines, SettingsService, RarBG) {
    if (SettingsService.get('torrenting.enabled')) {
      TorrentSearchEngines.registerSearchEngine('RarBG', RarBG)
    }
  }
])
;
/**
 * ShowRSS.info custom Torrent API interfacing.
 * Scrapes the shows list from ShowRSS.info and tries to fetch the magnet links for an episode.
 */
DuckieTV.factory('ShowRSS', ['SettingsService', '$q', '$http',
  function(SettingsService, $q, $http) {
    var endpoint = SettingsService.get('mirror.ShowRSS')

    var endpoints = {
      list: '/browse',
      serie: '/browse/%s'
    }

    var getUrl = function(type, param, param2) {
      var out = endpoint + endpoints[type].replace('%s', encodeURIComponent(param))
      return (param2 !== undefined) ? out.replace('%s', encodeURIComponent(param2)) : out
    }

    var parsers = {
      list: function(result) {
        var parser = new DOMParser()
        var doc = parser.parseFromString(result.data, 'text/html')
        var results = doc.querySelectorAll('select option')
        var output = {}
        Array.prototype.map.call(results, function(node) {
          if (node.value === '') return
          output[node.innerText.trim()] = node.value
        })
        return output
      },
      serie: function(result) {
        var parser = new DOMParser()
        var doc = parser.parseFromString(result.data, 'text/html')

        var results = doc.querySelectorAll('div.col-md-10 ul.user-timeline li > a')
        var output = []
        Array.prototype.map.call(results, function(node) {
          var out = {
            magnetUrl: node.href,
            noMagnet: false,
            noTorrent: true,
            releasename: node.innerText.replace(/\s/g, ' ').trim(),
            size: 'n/a',
            seeders: 'n/a',
            leechers: 'n/a',
            detailUrl: doc.querySelector("a[href^='" + endpoint + "/browse/']").href
          }

          var magnetHash = out.magnetUrl.match(/([0-9ABCDEFabcdef]{40})/)
          if (magnetHash && magnetHash.length) {
            out.torrentUrl = 'http://itorrents.org/torrent/' + magnetHash[0].toUpperCase() + '.torrent?title=' + encodeURIComponent(out.releasename.trim())
            out.noTorrent = false
            output.push(out)
          }
        })
        return output
      }
    }

    /**
         * If a customized parser is available for the data, run it through that.
         */
    var getParser = function(type) {
      return type in parsers ? parsers[type] : function(data) {
        return data.data
      }
    }

    /**
     * Promise requests with batchmode toggle to auto-kill a previous request when running.
     * The activeRequest and batchMode toggles make sure that find-as-you-type can execute multiple
     * queries in rapid succession by aborting the previous one. Can be turned off at will by using enableBatchMode()
     */
    var promiseRequest = function(type, param, param2, promise) {
      var url = getUrl(type, param, param2)
      var parser = getParser(type)

      return $http.get(url, {
        timeout: promise || 30000,
        cache: true
      }).then(function(result) {
        return parser(result)
      })
    }

    return {
      search: function(query) {
        query = query.toUpperCase()
        // console.debug("Searching showrss!", query);
        if (!query.match(/S([0-9]{1,2})E([0-9]{1,3})/)) {
          return $q(function(resolve, reject) {
            reject("Sorry, ShowRSS only works for queries in format : 'Seriename SXXEXX'")
          })
        }
        return promiseRequest('list').then(function(results) {
          var found = Object.keys(results).filter(function(value) {
            return query.indexOf(value.toUpperCase()) === 0
          })
          if (found.length == 1) {
            return promiseRequest('serie', results[found[0]]).then(function(results) {
              var parts = query.match(/S([0-9]{1,2})E([0-9]{1,3})/)
              if (!parts) {
                return results
              }
              var seasonepisode = parts[0]
              var showRSSseasonepisode = seasonepisode.replace('S' + parts[1], parseInt(parts[1], 10)).replace('E' + parts[2], '×' + parts[2])
              return results.filter(function(el) {
                // replace the showRSS season episode string ssXee with SssEee or it will fail the strict filterByScore in autoDownload and torrentDialog
                var originalReleaseName = el.releasename
                el.releasename = el.releasename.replace(showRSSseasonepisode, seasonepisode)
                return originalReleaseName.indexOf(showRSSseasonepisode) > -1
              })
            })
          } else {
            return []
          }
        })
      },
      cancelActiveRequest: function() {
        // dummy stub to satisfy call from  TorrentSearchEngines.getSearchEngine($scope.searchprovider).cancelActiveRequest();
      },
      config: {}
    }
  }
])

DuckieTV.run(['TorrentSearchEngines', 'SettingsService', 'ShowRSS',
  function(TorrentSearchEngines, SettingsService, ShowRSS) {
    if (SettingsService.get('torrenting.enabled')) {
      TorrentSearchEngines.registerSearchEngine('ShowRSS', ShowRSS)
    }
  }
])
;
DuckieTV.run(['TorrentSearchEngines', 'SettingsService', '$q', '$http', '$injector',
  function(TorrentSearchEngines, SettingsService, $q, $http, $injector) {
    if (SettingsService.get('torrenting.enabled')) {
      TorrentSearchEngines.registerSearchEngine('TorrentDownloads', new GenericTorrentSearchEngine({
        mirror: SettingsService.get('mirror.TorrentDownloads'),
        mirrorResolver: null,
        includeBaseURL: true,
        endpoints: {
          search: '/search/?search=%s'
        },
        selectors: {
          resultContainer: 'div[class^="grey_bar3"]',
          releasename: ['p a[href^="/torrent/"]', 'innerText'],
          seeders: ['span:nth-of-type(3)', 'innerText'],
          leechers: ['span:nth-of-type(2)', 'innerText'],
          size: ['span:nth-of-type(4)', 'innerText'],
          detailUrl: ['p a[href^="/torrent/"]', 'href']
        },
        detailsSelectors: {
          detailsContainer: 'div[class="inner_container"]',
          magnetUrl: ['a[href^="magnet:"]', 'href'],
          torrentUrl: ['a[href^="http://itorrents.org/torrent/"]', 'href']
        }
      }, $q, $http, $injector))
    }
  }
])
;
DuckieTV.run(['TorrentSearchEngines', 'SettingsService', '$q', '$http', '$injector',
  function(TorrentSearchEngines, SettingsService, $q, $http, $injector) {
    if (SettingsService.get('torrenting.enabled')) {
      TorrentSearchEngines.registerSearchEngine('TGx', new GenericTorrentSearchEngine({
        mirror: SettingsService.get('mirror.TGx'),
        mirrorResolver: null,
        includeBaseURL: true,
        endpoints: {
          search: '/torrents.php?search=%s&lang=0&sort=%o'
        },
        selectors: {
          resultContainer: 'div[onmouseover]',
          releasename: ['div a[href^="/torrent/"]', 'title'],
          magnetUrl: ['div a[href^="magnet:?"]', 'href'],
          size: ['div span[style^="border-radius"]', 'innerText'],
          seeders: ['div span[title="Seeders/Leechers"] font b', 'innerText'],
          leechers: ['div span[title="Seeders/Leechers"] font:nth-child(2) b', 'innerText'],
          detailUrl: ['div a[href^="/torrent/"]', 'href']
        },
        orderby: {
          seeders: {d: 'seeders&order=desc', a: 'seeders&order=asc'},
          size: {d: 'size&order=desc', a: 'size&order=asc'}
        }
      }, $q, $http, $injector))
    }
  }
])
;
DuckieTV.factory('SynologyAPI', ['$q', '$http', 'URLBuilder', 'SettingsService', function($q, $http, URLBuilder, SettingsService) {
  var self = this

  var config = {
    ip: '192.168.178.222',
    port: '5000',
    protocol: 'http',
    username: null,
    password: null,
    url: '/webapi/%s'
  }

  var errors = {
    100: 'Unknown error',
    101: 'Invalid parameter',
    102: 'The requested API does not exist',
    103: 'The requested method does not exist',
    104: 'The requested version does not support the functionality',
    105: 'The logged in session does not have permission',
    106: 'Session timeout',
    107: 'Session interrupted by duplicate login',
    400: 'Authorization failure',
    401: 'Guest or disabled account',
    402: 'Permission denied - DSM-Session: make sure user is member of Admin-group',
    403: 'One time password not specified',
    404: 'One time password authenticate failed',
    407: 'Permission denied - IP banned in DSM blocklist?',
    450: 'Unknown Error'
  }

  /**
     * API will be automagically loaded from synology device, then initialized goes to true.
     */
  this.initialized = false
  this.initializing = false

  this.api = {
    'SYNO.API.Info': {}
  }

  this.devices = []

  this.sessionID = SettingsService.get('synology.sessionID', null)

  var parsers = {

    'SYNO.VideoStation.Folder': function(response) {
      return response.objects
    }

  }

  function request(apiMethod, parameters) {
    /**
         * Always auto-initialize.
         */
    if (!self.initialized && apiMethod != 'SYNO.API.Info') {
      return service.fetchAPIInfo().then(function() {
        return request(apiMethod, parameters)
      })
    }

    if (self.sessionID) {
      parameters._sid = self.sessionID
    }
    var url = buildUrl(apiMethod, parameters)
    delete (parameters._sid)
    if (parameters.path) {
      delete parameters.path
    }
    return $http.post(url, URLBuilder.build('', parameters).slice(1), {
      transformRequest: angular.identity,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })
      .then(function(result) {
        if (result.data.error) {
          throw Error(errors[result.data.error.code])
        }
        return result.data.data
      }, function(err) {
        console.error('Synology API ERROR', err)
        throw Error('ERROR executing ' + apiMethod + (err.message ? ':' + err.message : ''))
      })
  }

  function buildUrl(apiMethod, params) {
    var url = config.url
    if (('path' in params)) {
      url = url.replace('%s', params.path)
      delete params.path
    } else if ((apiMethod in self.api)) {
      url = url.replace('%s', self.api[apiMethod].path)
    }
    params.api = apiMethod

    return URLBuilder.build(config.protocol + '://' + config.ip + ':' + config.port + url)
  }

  /**
     * Merge default config parameters when not set
     */
  function mergeDefaults(config, defaults) {
    if (!config) {
      config = {}
    }
    Object.keys(defaults).map(function(key) {
      if (!(key in config)) {
        config[key] = defaults[key]
      }
    })
    return config
  }

  var service = {

    fetchAPIInfo: function() {
      if (!self.initialized && !self.initializing) {
        self.initializing = true
        return request('SYNO.API.Info', {
          'path': 'query.cgi',
          'method': 'query',
          'version': '1',
          'query': 'all'
        }).then(function(result) {
          self.api = result
          self.initialized = true
          self.initializing = false
          return self.api
        })
      } else if (self.initialized) {
        return $q.when(function() {
          return self.api
        })
      } else {
        return $q(function(resolve) {
          setTimeout(function() {
            resolve(service.fetchAPIInfo)
          }, 1000)
        })
      }
    },
    init: function() {
      if (self.sessionID !== null) {
        return $q.when(function() {
          return self.sessionID
        })
      }
      return request('SYNO.API.Auth', {
        'method': 'login',
        'version': '2',
        'session': 'VideoStation',
        'format': 'cookie',
        'account': config.username,
        'passwd': config.password
      }).then(function(result) {
        self.sessionID = result.sid
        SettingsService.set('synology.sessionID', result.sid)
        return true
      })
    },
    deAuthorize: function() {
      this.sessionID = null
      SettingsService.set('synology.sessionID', null)
    },
    isAuthenticated: function() {
      return self.sessionID !== null
    },
    getSessionID: function() {
      return self.sessionID
    },
    setConfig: function(newConfig) {
      Object.keys(newConfig).map(function(key) {
        config[key] = newConfig[key]
      })
    },
    DeviceList: function() {
      return request('SYNO.VideoController.Device', {
        method: 'list',
        version: 1
      }).then(function(result) {
        self.devices = result.devices
        return result.devices
      })
    },
    Library: function(parameters) {
      return request('SYNO.VideoStation2.Library', mergeDefaults(parameters, {
        method: 'list',
        offset: 0,
        limit: 1000,
        version: 1
      })).then(function(response) {
        return response.libraries
      })
    },
    Poster: function(parameters) {
      return request('SYNO.VideoStation.Poster', parameters)
    },
    PluginSearch: function(parameters) {
      if (!('method' in parameters)) {
        parameters.method = 'list'
      }
      if (parameters.method === 'list') {
        parameters = mergeDefaults(parameters, {
          offset: '0',
          limit: '500',
          sort_by: 'title',
          sort_direction: 'asc'

        })
      }
      if (parameters.method === 'start') {
        parameters.preferlanguage = 'eng'
      }
      parameters.version = 1
      return request('SYNO.VideoStation.PluginSearch', parameters)
    },
    Folder: function(parameters) {
      return request('SYNO.VideoStation.Folder', mergeDefaults(parameters, {
        method: 'list',
        sort_by: 'title',
        offset: '0',
        limit: '1000',
        sort_direction: 'asc',
        library_id: '0',
        type: 'tvshow',
        id: '',
        version: 1
      })).then(function(result) {
        return result.objects
      })
    },
    Metadata: function(parameters) {
      if (!('method' in parameters)) {
        parameters.method = 'list'
      }
      return request('SYNO.VideoStation.Metadata', parameters)
    },
    Movie: function(parameters) {
      // set parameters to empty if they are not defined in input variable
      if (!('method' in parameters)) {
        parameters.method = 'list'
      }
      // default parameters for list method
      if (parameters.method == 'list') {
        parameters = mergeDefaults(parameters, {
          sort_by: 'title',
          offset: '0',
          limit: '1000',
          sort_direction: 'asc',
          library_id: '0',
          actor: '[]',
          director: '[]',
          writer: '[]',
          genre: '[]',
          year: '[]',
          date: '[]',
          channel_name: '[]',
          title: '[]',
          resolution: '[]',
          watchedstatus: '[]',
          filecount: '[]',
          container: '[]',
          duration: '[]',
          additional: '["watched_ratio"]',
          version: '2'
        })
      }
      request('SYNO.VideoStation.Movie', parameters)
    },
    Device: function(parameters) {
      return request('SYNO.Videostation2.Controller.Device', mergeDefaults(parameters, {
        method: 'list',
        version: 1
      }))
    },
    PlayFile: function(file, device) {
      var parameters = {
        'method': 'play',
        'position': '0'
      }
      parameters.id = device.id
      parameters.title = device.title
      parameters.file_id = file.id

      if (this.currentSubtitles !== undefined) {
        parameters.subtitle_id = this.currentSubtitles
      }
      return service.Playback(parameters)
    },
    Playback: function(parameters) {
      return request('SYNO.VideoController.Playback', mergeDefaults(parameters, {
        method: 'status',
        version: 2
      }))
    },
    Volume: function(parameters) {
      return request('SYNO.VideoController.Volume', mergeDefaults(parameters, {
        method: 'getvolume',
        version: 1
      }))
    },
    Subtitle: function(parameters) {
      return request('SYNO.VideoStation.Subtitle', mergeDefaults(parameters, {
        method: 'list',
        version: 2
      }))
    }
  }

  return service
}])
;
/**
 * A little service that checks localStorage for the upgrade.notify key.
 * If it's not null we fetch the upgrade notification message the notifications key
 * and present it in a dialog if it's available.
 *
 * If the user closes the dialog, the notification is dismissed and not shown again.
 */
DuckieTV.run(['dialogs', '$http',
  function(dialogs, $http) {
    var dlgLinks = '<h2>Questions? Suggestions? Bugs? Kudo\'s?</h2>Find DuckieTV on <a href="https://reddit.com/r/DuckieTV" target="_blank">Reddit</a> or <a href="https://facebook.com/DuckieTV/" target="_blank">Facebook</a>.<br>If you find a bug, please report it on <a href="https://github.com/SchizoDuckie/DuckieTV/issues">Github</a></em>'
    var notifications = {
      '1.1.6': ['<li>Languages: (new) Greek, Turkish, Slovak and South African English.',
        '<li>Languages: (fix) Chinese, Dutch.',
        '<li>AutoDownload: (new) Now able to use series custom Seeders, custom Includes and custom Excludes.',
        '<li>TMDBArt: (new) Refactor image loading to use TMDB. This complements and progressively takes over from FanArt.',
        '<li>FanArt: (fix) Previously the default image was selected, now select the first English image if available.',
        '<li>Calendar: (fix) unable to click on calendar in chromium 101.',
        '<li>SearchEngines: (new) Add ETag (extratorrent.st), IsoHunt2 (isohunt.tv), TGx (torrentgalaxy.to), EXT (ext.to), KATws (kickass.ws), Knaben (knaben.eu).',
        '<li>SearchEngines: (del) Katcr is broken, TorrentZ2 is gone, ETTV is gone, Zooqle is gone.',
        '<li>SearchEngines: (fix) EzTVag new domain (eztv.wf) and results, limetorrrents DL links and new domain, 1337x DL links, TPB (*0.org), TPB mirror resolver, RarBG details links and RateLimit, torrentdownloads new domain, fix details link for Jackett indexers.',
        '<li>Standalone: NWJS 69.0 with Chromium 106. Fixes slow macos.',
        '<li>Standalone: (fix) Prevent Chromium 79+ freezing tab if idle for more than 5 mins. Switch chromium-args: --disable-backgrounding-occluded-windows with --disable-calculate-native-win-occlusion to prevent midnight white-screen of death.',
        '<li>TorrentClient: (new) Introducing tTorrent client.',
        '<li>TorrentClient: (fix) Replace deprecaded rTorrent calls, add support for qBitTorrent 4.2+, ignore aria2 metadata file reports.',
        '<li>TorrentClient: (fix) qBitTorrent 4.5+ fix API call to remove torrent',
        '<li>TorrentClient: (fix) Upgrade Tixati API for 2.86+. Note that older versions are no longer supported.',
        '<li>TorrentDialogs: (fix) magnetLinks were being submitted twice due to NWJS bug.',
        '<li>TorrentMonitor: (fix) Auto-Stop-All now works as intended.',
        '<li>TraktUpdateServices: (fix) Support added for new API restrictions.',
        '<li>Misc: Bug fixes.'
      ].join('')
    }

    $http.get('VERSION').then(function(data, status, headers, config) {
      var notifyVersion = data.data
      if (notifyVersion != null && (notifyVersion in notifications) && localStorage.getItem('upgrade.notify') != notifyVersion) {
        var dlg = dialogs.notify('DuckieTV was upgraded to ' + notifyVersion,
          "<h2>What's new in this version:</h2>" + notifications[notifyVersion] + dlgLinks, {}, {
            size: 'lg'
          })
        dlg.result.then(function() {
          localStorage.setItem('upgrade.notify', notifyVersion)
        })
      }
    })
  }
])
;
/**
 * TorrentFreak Top 10 Most Pirated Movies
 */
DuckieTV.provider('TorrentFreak', function() {
  var endpoints = {
    archive: 'https://torrentfreak.com/most-pirated-movies-of-%s/' // may need maintenance?
  }

  /**
   * Get and transform url
   */
  function getUrl(type, param) {
    return endpoints[type].replace('%s', encodeURIComponent(param))
  }

  /**
   * Snag all tables from the archive page, parse them and feed them to the directive.
   */
  function parseTables(result) {
    var parser = new DOMParser()
    var doc = parser.parseFromString(result.data, 'text/html')
    var tables = doc.querySelectorAll('table.css.hover');
    var titles = doc.querySelectorAll('h2');
    var output = [];
    for(var i=0; i<tables.length; i++) {
      var rows = tables[i].querySelectorAll('tbody tr'),
      out = {
        title: titles[i].textContent,
        top10: []
      };

      for (var k = 0; k < rows.length; k++) {
        var rowItems = rows[k].querySelectorAll('td')
        if (rowItems.length < 4) continue
        // console.debug('rank: ',rowItems[0].innerText);
        // console.debug('prevRank: ',rowItems[1].innerText.replace('(', '').replace(')', ''));
        // console.debug('title: ',rowItems[2].innerText);
        // console.debug('searchTitle: ',rowItems[2].querySelectorAll('a').length > 0 ? rowItems[2].querySelector('a').innerText : 'null');
        // console.debug('rating: ',rowItems[3].querySelectorAll('a').length > 0 ? rowItems[3].querySelectorAll('a')[0].innerText : 'null');
        // console.debug('imdb: ',rowItems[3].querySelectorAll('a').length > 0 ? rowItems[3].querySelectorAll('a')[0].href : 'null');
        // console.debug('trailer: ',(rowItems[3].querySelectorAll('a').length == 2 ? rowItems[3].querySelectorAll('a')[1].href : 'null'));
        var row = {};
        try {
          row.rank = rowItems[0].innerText;
          row.prevRank = rowItems[1].innerText.replace('(', '').replace(')', '');
          row.title = rowItems[2].innerText;
          row.searchTitle = rowItems[2].querySelectorAll('a').length > 0 ? rowItems[2].querySelector('a').innerText : rowItems[2].innerText;
          row.rating = rowItems[3].querySelectorAll('a').length > 0 ? rowItems[3].querySelectorAll('a')[0].innerText : '?';
          row.imdb = rowItems[3].querySelectorAll('a').length ? rowItems[3].querySelectorAll('a')[0].href : '';
          row.trailer = rowItems[3].querySelectorAll('a').length == 2 ? rowItems[3].querySelectorAll('a')[1].href : '';
          out.top10.push(row)
        } catch(E) {
          console.log("Parse error in row. Torrentfreak changed their formatting again?", E, rowItems);
        }
      }
      output.unshift(out);
    }
    return output
  }


  this.$get = ['$http',
    function($http) {
      return {
        Archive: function() {
          return $http({
            method: 'GET',
            url: getUrl('archive', new Date().getFullYear()),
            cache: true
          })
          .then(parseTables);
        }
      };
    }
  ]
})
.directive('top10PiratedMovies', function() {
  return {
    restrict: 'E',
    templateUrl: 'templates/torrentFreakTop10.html',
    controller: ['TorrentFreak', '$injector',
      function(TorrentFreak, $injector) {
        var vm = this
        this.activeItem
        this.items = []
        this.itemIndex = 0
        this.activeItem = []

        /**
         * Closes the SidePanel
         */
        this.closeSidePanel = function() {
          $injector.get('$state').go('calendar')
        }

        /**
         * Switch to the previous item in the Top10 RSS feed while the index isn't maxxed out
         */
        this.prevItem = function() {
          if (this.itemIndex < vm.items.length - 1) {
            this.itemIndex += 1
            this.activeItem = vm.items[vm.itemIndex]
          }
        }

        /**
         * Switch to the next item in the Top10 RSS feed results while the index is > 0
         */
        this.nextItem = function() {
          if (this.itemIndex > 0) {
            this.itemIndex -= 1
            this.activeItem = vm.items[vm.itemIndex]
          }
        }

        /**
         * Fetch the Top10 RSS feed, render the first item as HTML and put it on the scope.
         */
        TorrentFreak.Archive()
          .then(function(result) {
            vm.items = result;
            vm.activeItem = result[0];
          })
      }
    ],
    controllerAs: 'vm',
    bindToController: true
  }
});
;
DuckieTV.factory('TMDBService', ['$http', function($http) {
  const API_URL = 'https://api.themoviedb.org/3'
  const API_KEY = '79d916a2d2e91ff2714649d63f3a5cc5'
  const TMDB_POSTER_BASE = 'https://image.tmdb.org/t/p/'

  // TMDB has no rate limiting and their API is generally very fast
  // this just throttles the concurrent requests to 10 at a time
  const semaphore = new Semaphore(10)

  const service = {
    /**
     * Get the image url for a given path
     * @param path the path to the image
     * @param {('w500'|'original')|string} size size of the image, defaults to w500, see https://developers.themoviedb.org/3/getting-started/images
     * @return {string|undefined}
     */
    getImageUrl: function(path, size = 'w500') {
      if (!path) {
        return
      }

      return `${TMDB_POSTER_BASE}${size}${path}`
    },
    getShow: function(tmdbId) {
      return service.makeRequest(`${API_URL}/tv/${tmdbId}?api_key=${API_KEY}&language=en-US`)
    },
    getSeason: function(tmdbId, seasonNumber) {
      return service.makeRequest(`${API_URL}/tv/${tmdbId}/season/${seasonNumber}?api_key=${API_KEY}&language=en-US`)
    },
    makeRequest: async function(url) {
      try {
        await semaphore.wait()
        const response = await $http.get(url)

        if (response.status === 200) {
          return response.data
        }

        throw response
      } catch (err) {
        console.error('Error making request to TMDB', err)
        return null
      } finally {
        semaphore.release()
      }
    }
  }

  return service
}])

class Semaphore {
  constructor(initialCount) {
    this.count = initialCount
    this.waiters = []
  }

  async wait() {
    if (this.count > 0) {
      this.count--
      return
    }

    await new Promise(resolve => {
      this.waiters.push(resolve)
    })

    this.count--
  }

  release() {
    this.count++

    if (this.waiters.length > 0) {
      const next = this.waiters.shift()
      next()
    }
  }
}
;
/**
 * Trakt TV V2 API interfacing.
 * Throughout the app the API from Trakt.TV is used to fetch content about shows and optionally the user's data
 *
 * For API docs: check here: http://docs.trakt.apiary.io/#
 */
DuckieTV.factory('TraktTVv2', ['$q', '$http', 'SceneNameResolver',
  function($q, $http, SceneNameResolver) {
    var activeSearchRequest = false
    var activeTrendingRequest = false

    var APIkey = '90b2bb1a8203e81a0272fb8717fa8b19ec635d8568632e41d1fcf872a2a2d9d0'
    var endpoint = 'https://api.trakt.tv/'
    var pinUrl = 'https://trakt.tv/pin/948'

    var endpoints = {
      people: 'shows/%s/people',
      serie: 'shows/%s?extended=full',
      seasons: 'shows/%s/seasons?extended=full',
      episodes: 'shows/%s/seasons/%s/episodes?extended=full',
      search: 'search/show?extended=full&limit=100&fields=title,aliases&query=%s',
      trending: 'shows/trending?extended=full&limit=500',
      tvdb_id: 'search/tvdb/%s?type=show',
      trakt_id: 'search/trakt/%s?type=show',
      login: 'auth/login',
      updated: 'shows/updates/%s?limit=10000',
      config: 'users/settings',
      token: 'oauth/token',
      watched: 'sync/watched/shows?limit=10000',
      episodeSeen: 'sync/history',
      episodeUnseen: 'sync/history/remove',
      userShows: 'sync/collection/shows?limit=10000',
      addCollection: 'sync/collection',
      removeCollection: 'sync/collection/remove',
      newshows: 'calendars/all/shows/new/%s/180'
    }

    var parsers = {
      trakt: function(show) {
        Object.keys(show.ids).map(function(key) {
          show[key + '_id'] = show.ids[key]
        })
        if ('title' in show) {
          show.name = show.title
        }
        // fill in the tvdb_id if it is missing from  the Trakt.tv API and we have it in our Xref table
        show.tvdb_id = ('tvdb_id' in show && show.tvdb_id !== null && show.tvdb_id !== 0) ? show.tvdb_id : SceneNameResolver.getTvdbidFromTraktid(show.trakt_id)
        return show
      },
      people: function(result) {
        return result.data
      },
      seasons: function(result) {
        return result.data.map(function(season) {
          return parsers.trakt(season)
        })
      },
      search: function(result) {
        return result.data.map(function(show) {
          return parsers.trakt(show.show)
        })
      },
      trending: function(result) {
        return result.data.map(function(show) {
          return parsers.trakt(show.show)
        })
      },
      newshows: function(result) {
        return result.data.map(function(show) {
          return parsers.trakt(show.show)
        })
      },
      episodes: function(result) {
        var map = []

        var episodes = []

        result.data.map(function(episode) {
          if (map.indexOf(episode.number) > -1 || episode.number === 0) return
          episodes.push(parsers.trakt(episode))
          map.push(episode.number)
        })
        return episodes
      },
      /**
       * Trakt returns a list of search results here. We want only the first object that has a serie detail object in it.
       * @param  trakt result data
       * @return serie parsed serie
       */
      serie: function(result) {
        return parsers.trakt(result.data)
      },
      tvdb_id: function(result) {
        // this prevents choking on series custom settings during import of backup
        var results = result.data.filter(function(record) {
          return record.type == 'show'
        })
        if (results.length > 0) {
          return parsers.trakt(results[0].show)
        } else {
          throw 'No results for search by tvdb_id'
        }
      },
      trakt_id: function(result) {
        // this prevents choking on series custom settings during import of backup
        var results = result.data.filter(function(record) {
          return record.type == 'show'
        })
        if (results.length > 0) {
          return parsers.trakt(results[0].show)
        } else {
          throw 'No results for search by trakt_id'
        }
      },
      updated: function(result) {
        return result.data.map(function(show) {
          out = parsers.trakt(show.show)
          out.remote_updated = show.updated_at
          return out
        })
      },
      watched: function(result) {
        return result.data.map(function(show) {
          out = parsers.trakt(show.show)
          out.seasons = show.seasons
          return out
        })
      },
      userShows: function(result) {
        return result.data.map(function(show) {
          out = parsers.trakt(show.show)
          out.seasons = show.seasons
          return out
        })
      }
    }

    function delay(ms) {
      return new Promise(function(resolve) {
        setTimeout(resolve, ms)
      })
    }

    // trakt api GET methods that require authorisation
    var authorized = [
      'watched', 'userShows', 'config'
    ]

    /**
     * Get one of the urls from the endpoint and replace the parameters in it when provided.
     */
    var getUrl = function(type, param, param2) {
      var out = endpoint + endpoints[type].replace('%s', encodeURIComponent(param))
      return (param2 !== undefined) ? out.replace('%s', encodeURIComponent(param2)) : out
    }

    /**
     * If a customized parser is available for the data, run it through that.
     */
    var getParser = function(type) {
      return type in parsers ? parsers[type] : function(data) {
        return data.data
      }
    }

    /**
     * Generic error-catching and re-throwing
     */
    var rethrow = function(err) {
      throw err
    }

    /**
     * Promise requests with batchmode toggle to auto-kill a previous request when running.
     * The activeRequest and batchMode toggles make sure that find-as-you-type can execute multiple
     * queries in rapid succession by aborting the previous one. Can be turned off at will by using enableBatchMode()
     */
    var promiseRequest = function(type, param, param2, promise) {
      var url = getUrl(type, param, param2)
      var parser = getParser(type)
      var headers = {
        'trakt-api-key': APIkey,
        'trakt-api-version': 2,
        'Content-Type': 'application/json'
      }
      if (authorized.indexOf(type) > -1) {
        headers.Authorization = 'Bearer ' + localStorage.getItem('trakttv.token')
      }
      return $http.get(url, {
        timeout: promise || 120000,
        headers: headers,
        cache: false
      }).then(function(result) {
        return parser(result)
      }, function(err) {
        if (err.status == 401) {
          // token auth expired, renew
          service.renewToken()
          // restart request and return original promise
          return promiseRequest(type, param, param2, promise)
        }

        if (err.status == 429) {
          // rate limited, look at headers to see when we should try again otherwise just wait for a few seconds
          var headers = err && err.headers ? err.headers() : {}
          var retryAfterSeconds = +headers['retry-after']
          retryAfterSeconds  = retryAfterSeconds ? retryAfterSeconds : 3
          console.error('Trakt rate limited! trying again in %s seconds', retryAfterSeconds)

          return delay(retryAfterSeconds * 1000).then(function() {
            return promiseRequest(type, param, param2, promise)
          })
        }

        if (err.status == 502) {
          // cloudflare bad gateway, look at headers to see when we should try again otherwise just wait for a few seconds
          var headers = err && err.headers ? err.headers() : {}
          var retryAfterSeconds = +headers['retry-after']
          retryAfterSeconds  = retryAfterSeconds ? retryAfterSeconds : 3
          console.error('cloudflare bad gateway, trying again in %s seconds', retryAfterSeconds)

          return delay(retryAfterSeconds * 1000).then(function() {
            return promiseRequest(type, param, param2, promise)
          })
        }

        if (err.status == 504) {
          // cloudflare gateway timeout, look at headers to see when we should try again otherwise just wait for a few seconds
          var headers = err && err.headers ? err.headers() : {}
          var retryAfterSeconds = +headers['retry-after']
          retryAfterSeconds  = retryAfterSeconds ? retryAfterSeconds : 3
          console.error('cloudflare gateway timeout, trying again in %s seconds', retryAfterSeconds)

          return delay(retryAfterSeconds * 1000).then(function() {
            return promiseRequest(type, param, param2, promise)
          })
        }

        if (err.status !== 0) { // only if this is not a cancelled request, rethrow
          //console.error('Trakt tv error!', err)
          throw 'Error ' + err.status + ':' + err.statusText
        }
      })
    }

    var performPost = function(type, param) {
      var url = getUrl(type)
      var headers = {
        'trakt-api-key': APIkey,
        'trakt-api-version': 2,
        'Authorization': 'Bearer ' + localStorage.getItem('trakttv.token'),
        'Content-Type': 'application/json'
      }
      return $http.post(url, param, {
        headers: headers
      }).then(function(result) {
        return result
      }, function(err) {
        if (err.status == 401) {
          // token auth expired, renew
          service.renewToken()
          // restart request and return original promise
          return performPost(type, param)
        }
        if (err.status == 429) {
          // rate limited
          var headers = err && err.headers ? err.headers() : {}
          var retryAfterSeconds = +headers['retry-after']
          retryAfterSeconds  = retryAfterSeconds ? retryAfterSeconds : 3
          console.error('Trakt rate limited! trying again in %s seconds', retryAfterSeconds)
          return delay(retryAfterSeconds * 1000).then(function() {
            return performPost(type, param)
          })
        }
        if (err.status !== 0) { // only if this is not a cancelled request, rethrow
          console.error('Trakt tv error!', err)
          throw 'Error ' + err.status + ':' + err.statusText
        }
      })
    }

    var service = {
      /**
       * get a single show summary.
       * id can be Trakt.tv ID, Trakt.tv slug, or IMDB ID
       * http://docs.trakt.apiary.io/#reference/shows/summary/get-a-single-show
       */
      serie: async function(id, existingSerie, seriesOnly) {
        try {
          var serie = existingSerie || await promiseRequest('serie', id)
          if (seriesOnly) {
            return serie
          }

          await Promise.all([
            service.people(serie.trakt_id),
            service.seasons(serie.trakt_id)
          ]).then(function([people, seasons]) {
            serie.people = people
            serie.seasons = seasons
          })

          await Promise.all(serie.seasons.map(async function(season) {
            season.episodes = await service.episodes(serie.trakt_id, season.number)
            return season
          }))

          return serie
        } catch (err) {
          rethrow(err)
        }
      },
      /**
       * get all seasons for a show.
       * id can be Trakt.tv ID, Trakt.tv slug, or IMDB ID
       * http://docs.trakt.apiary.io/#reference/seasons/summary/get-all-seasons-for-a-show
       */
      seasons: function(id) {
        return promiseRequest('seasons', id)
      },
      /**
       * get all episodes for a show.
       * id can be Trakt.tv ID, Trakt.tv slug, or IMDB ID
       * season is a number
       * http://docs.trakt.apiary.io/#reference/episodes/summary
       */
      episodes: function(id, seasonNumber) {
        return promiseRequest('episodes', id, seasonNumber)
      },
      /**
       * get all actors in a show.
       * id can be Trakt.tv ID, Trakt.tv slug, or IMDB ID
       * http://docs.trakt.apiary.io/#reference/shows/people/get-all-people-for-a-show
       */
      people: function(id) {
        return promiseRequest('people', id)
      },
      search: function(what) {
        service.cancelTrending()
        service.cancelSearch()
        activeSearchRequest = $q.defer()
        return promiseRequest('search', what, null, activeSearchRequest.promise).then(function(results) {
          activeSearchRequest = false
          return results
        })
      },
      cancelSearch: function() {
        if (activeSearchRequest && activeSearchRequest.resolve) {
          activeSearchRequest.reject('search abort')
          activeSearchRequest = false
        }
      },
      hasActiveSearchRequest: function() {
        return (activeSearchRequest && activeSearchRequest.resolve)
      },
      trending: function(noCache) {
        if (noCache != true) {
          if (!localStorage.getItem('trakttv.trending.cache')) {
            return $http.get('trakt-trending-500.json').then(function(result) {
              var output = result.data.filter(function(show) {
                if (show.trakt_id) return true
              })
              localStorage.setItem('trakttv.trending.cache', JSON.stringify(output))
              return output
            })
          } else {
            return $q(function(resolve) {
              resolve(JSON.parse(localStorage.getItem('trakttv.trending.cache')))
            })
          }
        }

        service.cancelTrending()
        service.cancelSearch()
        activeTrendingRequest = $q.defer()
        return promiseRequest('trending', null, null, activeTrendingRequest.promise).then(function(results) {
          activeTrendingRequest = false
          cachedTrending = results
          return results
        })
      },
      newShows: function() {
        return promiseRequest('newshows', moment('yyyy-mm-dd')).then(function(results) {
          return results
        })
      },
      cancelTrending: function() {
        if (activeTrendingRequest && activeTrendingRequest.resolve) {
          activeTrendingRequest.resolve()
          activeTrendingRequest = false
        }
      },
      resolveID: function(id, useTrakt_id) {
        var TRAKTorTVDB_ID = useTrakt_id ? 'trakt_id' : 'tvdb_id'
        return promiseRequest(TRAKTorTVDB_ID, id).then(function(result) {
          return result
        }, function(error) {
          throw 'Could not resolve ' + TRAKTorTVDB_ID + ' ' + id + ' from Trakt.TV: ' + error
        })
      },
      getPinUrl: function() {
        return pinUrl
      },
      /**
       * Exchange code for access token.
       * http://docs.trakt.apiary.io/#reference/authentication-oauth/get-token/exchange-code-for-access_token
       */
      login: function(pin) {
        return $http.post(getUrl('token'), JSON.stringify({
          'code': pin,
          'client_id': '90b2bb1a8203e81a0272fb8717fa8b19ec635d8568632e41d1fcf872a2a2d9d0',
          'client_secret': 'f1c3e2df8f7a5e2705879fb33db655bc4aa96c0f33a674f3fc7749211ea46794',
          'redirect_uri': 'urn:ietf:wg:oauth:2.0:oob',
          'grant_type': 'authorization_code'
        }), {
          headers: {
            'trakt-api-key': APIkey,
            'trakt-api-version': 2,
            'Content-Type': 'application/json'
          }
        }).then(function(result) {
          localStorage.setItem('trakttv.token', result.data.access_token)
          localStorage.setItem('trakttv.refresh_token', result.data.refresh_token)
          return result.data.access_token
        }, function(error) {
          throw error
        })
      },
      /**
       * Exchange refresh_token for access token.
       * http://docs.trakt.apiary.io/#reference/authentication-oauth/get-token/exchange-refresh_token-for-access_token
       */
      renewToken: function() {
        return $http.post(getUrl('token'), JSON.stringify({
          'refresh_token': localStorage.getItem('trakttv.refresh_token'),
          'client_id': '90b2bb1a8203e81a0272fb8717fa8b19ec635d8568632e41d1fcf872a2a2d9d0',
          'client_secret': 'f1c3e2df8f7a5e2705879fb33db655bc4aa96c0f33a674f3fc7749211ea46794',
          'redirect_uri': 'urn:ietf:wg:oauth:2.0:oob',
          'grant_type': 'refresh_token'
        }), {
          headers: {
            'trakt-api-key': APIkey,
            'trakt-api-version': 2,
            'Content-Type': 'application/json'
          }
        }).then(function(result) {
          console.warn('Token has been renewed')
          localStorage.setItem('trakttv.token', result.data.access_token)
          localStorage.setItem('trakttv.refresh_token', result.data.refresh_token)
          return result.data.access_token
        }, function(error) {
          throw error
        })
      },
      /**
       * Returns recently updated shows.
       * http://docs.trakt.apiary.io/#reference/shows/updates/get-recently-updated-shows
       */
      updated: function(since) {
        return promiseRequest('updated', since)
      },
      /**
       * Returns all shows a user has watched.
       * http://docs.trakt.apiary.io/#reference/sync/get-watched/get-watched
       */
      watched: function() {
        return promiseRequest('watched').then(function(result) {
          console.info('Fetched V2 API watched results: ', result)
          return result
        })
      },
      /**
       * Mark an episode as watched.
       * http://docs.trakt.apiary.io/#reference/sync/add-to-history/add-items-to-watched-history
       */
      markEpisodeWatched: function(serie, episode) {
        return performPost('episodeSeen', {
          episodes: [{
            'watched_at': new Date(episode.watchedAt).toISOString(),
            ids: {
              trakt: episode.TRAKT_ID
            }
          }]
        }).then(function(result) {
          // console.debug("Episode watched:", serie, episode, result);
          return result
        })
      },
      /**
       * Batch mark episodes as watched.
       * http://docs.trakt.apiary.io/#reference/sync/add-to-history/add-items-to-watched-history
       */
      markEpisodesWatched: function(episodes) {
        var episodesArray = []
        angular.forEach(episodes, function(episode) {
          episodesArray.push({
            'watched_at': new Date(episode.watchedAt).toISOString(),
            'ids': {
              trakt: episode.TRAKT_ID
            }
          })
        })
        return performPost('episodeSeen', {
          episodes: episodesArray
        }).then(function(result) {
          // console.debug("trakt.TV episodes marked as watched:", episodes, result);
          return result
        })
      },
      /**
       * Mark an episode as not watched.
       * http://docs.trakt.apiary.io/#reference/sync/remove-from-history/remove-items-from-history
       */
      markEpisodeNotWatched: function(serie, episode) {
        return performPost('episodeUnseen', {
          episodes: [{
            ids: {
              trakt: episode.TRAKT_ID
            }
          }]
        }).then(function(result) {
          // console.debug("Episode un-watched:", serie, episode, result);
          return result
        })
      },
      /**
       * Returns all shows in a users collection.
       * http://docs.trakt.apiary.io/#reference/sync/get-collection/get-collection
       */
      userShows: function() {
        return promiseRequest('userShows').then(function(result) {
          console.info('Fetched V2 API User Shows: ', result)
          return result
        })
      },
      /**
       * add a show to a users collection.
       * http://docs.trakt.apiary.io/#reference/sync/add-to-collection/add-items-to-collection
       */
      addShowToCollection: function(serie) {
        return performPost('addCollection', {
          shows: [{
            ids: {
              trakt: serie.TRAKT_ID
            }
          }]
        }).then(function(result) {
          // console.debug("Added series %s to Trakt.TV user's collection.", serie.name, result);
          return result
        })
      },
      /**
       * add an episode to a users collection.
       * http://docs.trakt.apiary.io/#reference/sync/add-to-collection/add-items-to-collection
       */
      markEpisodeDownloaded: function(serie, episode) {
        return performPost('addCollection', {
          episodes: [{
            ids: {
              trakt: episode.TRAKT_ID
            }
          }]
        }).then(function(result) {
          // console.debug("Added episode %s of series %s to Trakt.TV user's collection.", episode.getFormattedEpisode(), serie.name, result);
          return result
        })
      },
      /**
       * removes a show from a users collection.
       * http://docs.trakt.apiary.io/#reference/sync/remove-from-collection/remove-items-from-collection
       */
      removeShowFromCollection: function(serie) {
        return performPost('removeCollection', {
          shows: [{
            ids: {
              trakt: serie.TRAKT_ID
            }
          }]
        }).then(function(result) {
          // console.debug("Removed series %s from Trakt.TV user's collection.", serie.name, result);
          return result
        })
      },
      /**
       * removes an episode from a users collection.
       * http://docs.trakt.apiary.io/#reference/sync/remove-from-collection/remove-items-from-collection
       */
      markEpisodeNotDownloaded: function(serie, episode) {
        return performPost('removeCollection', {
          episodes: [{
            ids: {
              trakt: episode.TRAKT_ID
            }
          }]
        }).then(function(result) {
          // console.debug("Removed episode %s of series %s from Trakt.TV user's collection.", episode.getFormattedEpisode(), serie.name, result);
          return result
        })
      }
    }
    return service
  }
])

  .run(['$rootScope', 'SettingsService', 'TraktTVv2', function($rootScope, SettingsService, TraktTVv2) {
    /**
     * Catch the event when an episode is marked as watched
     * and forward it to TraktTV if syncing enabled.
     */
    $rootScope.$on('episode:marked:watched', function(evt, episode) {
      // console.debug("Mark as watched and sync!", episode);
      if (SettingsService.get('trakttv.sync')) {
        CRUD.FindOne('Serie', {
          ID_Serie: episode.get('ID_Serie')
        }).then(function(serie) {
          TraktTVv2.markEpisodeWatched(serie, episode)
        })
      }
    })
    /**
     * Catch the event when an episode is marked as NOT watched
     * and forward it to TraktTV if syncing enabled.
     */
    $rootScope.$on('episode:marked:notwatched', function(evt, episode) {
      // console.debug("Mark as not watched and sync!", episode);
      if (SettingsService.get('trakttv.sync')) {
        CRUD.FindOne('Serie', {
          ID_Serie: episode.get('ID_Serie')
        }).then(function(serie) {
          TraktTVv2.markEpisodeNotWatched(serie, episode)
        })
      }
    })
    /**
     * Catch the event when an episode is marked as downloaded
     * and forward it to TraktTV if syncing enabled.
     */
    $rootScope.$on('episode:marked:downloaded', function(evt, episode) {
      // console.debug("Mark as downloaded and sync!", episode);
      if (SettingsService.get('trakttv.sync')) {
        CRUD.FindOne('Serie', {
          ID_Serie: episode.get('ID_Serie')
        }).then(function(serie) {
          TraktTVv2.markEpisodeDownloaded(serie, episode)
        })
      }
    })
    /**
     * Catch the event when an episode is marked as NOT downloaded
     * and forward it to TraktTV if syncing enabled.
     */
    $rootScope.$on('episode:marked:notdownloaded', function(evt, episode) {
      // console.debug("Mark as not downloaded and sync!", episode);
      if (SettingsService.get('trakttv.sync')) {
        CRUD.FindOne('Serie', {
          ID_Serie: episode.get('ID_Serie')
        }).then(function(serie) {
          TraktTVv2.markEpisodeNotDownloaded(serie, episode)
        })
      }
    })
  }])
;
DuckieTV.factory('TraktTVTrending', ['TraktTVv2', 'FavoritesService', '$q',
  function(TraktTVv2, FavoritesService, $q) {
    var vm = this
    vm.trending = []
    vm.categories = []
    vm.initializing = true

    /*
    * enables excluding series already in favourites from trending results
    */
    var alreadyAddedSerieFilter = function(serie) {
      return FavoritesService.favoriteIDs.indexOf(serie.trakt_id.toString()) === -1
    }

    var service = {
      getAll: function() {
        if (vm.initializing) {
          return TraktTVv2.trending().then(function(series) {
            if (!series) {
              series = []
            }

            vm.trending = series
            var cats = {}

            series.filter(alreadyAddedSerieFilter).map(function(serie) {
              if (!serie.genres) return
              serie.genres.map(function(category) {
                cats[category] = true
              })
            })

            vm.categories = Object.keys(cats)
            return series
          })
        } else {
          return $q(function(resolve) {
            resolve(vm.trending)
          })
        }
      },

      getByTraktId: function(trakt_id) {
        return vm.trending.filter(function(el) {
          return el.trakt_id == trakt_id
        })[0]
      },

      getCategories: function() {
        return vm.categories
      },

      getByCategory: function(category) {
        var filtered = vm.trending.filter(function(show) {
          if (!show.genres) return
          return show.genres.indexOf(category) > -1
        })
        return filtered
      }
    }

    service.getAll().then(function() {
      vm.initializing = false
    })

    return service
  }
])
;
/**
 * Trakt TV V2 API interfacing.
 * Throughout the app the API from Trakt.TV is used to fetch content about shows and optionally the user's data
 *
 * For API docs: check here: http://docs.trakt.apiary.io/#
 */
DuckieTV.factory('TraktTVUpdateService', ['$q', 'TraktTVv2', 'FavoritesService', 'FanartService', '$rootScope',
  function($q, TraktTVv2, FavoritesService, FanartService, $rootScope) {
    var service = {
      /**
       * Update shows in favorites list
       * Fetches all updated shows from trakt.tv since date of passed timestamp, checks if local series were updated
       * before that, and updates those.
       * @return promise updated items
       */
      update: async function() {
        var updatedCount = 0
        var i = -1
        var totalSeries = FavoritesService.favorites.length
        $rootScope.$broadcast('queryMonitor:update', {
          type: 'start',
          payload: { total: totalSeries, current: 0 }
        })

        for (var serie of FavoritesService.favorites) {
          try {
            i++
            var newSerie = await TraktTVv2.serie(serie.TRAKT_ID, null, true)
            var timeUpdated = new Date(newSerie.updated_at)
            var serieLastUpdated = new Date(serie.lastupdated)

            $rootScope.$broadcast('queryMonitor:update', {
              type: 'progress',
              payload: { total: totalSeries, current: i, name: serie.name }
            })

            if (timeUpdated <= serieLastUpdated) {
              continue // Hasn't been updated
            }

            console.log('[TraktTVUpdateService] [' + i + '/' + totalSeries + ']', 'updating', serie.name)
            newSerie = await TraktTVv2.serie(newSerie.trakt_id, newSerie)
            await FavoritesService.addFavorite(newSerie, undefined, undefined, true)
            updatedCount++
          } catch (err) {
            console.error('Error updating', serie.name, `[Id=${serie.ID_Serie}] [Trakt=${serie.TRAKT_ID}]`, err)
            // ignored
          }
        }

        $rootScope.$broadcast('queryMonitor:update', {
          type: 'finish',
          payload: { total: totalSeries, current: i + 1 }
        })

        return updatedCount
      },

      /**
       * Save Trakt.TV's trending list to localstorage once a week
       * Fetches images for any new shows added to the trending list
       * Existing shows with posters use their existing poster urls
       */
      updateCachedTrending: async function() {
        const trendingData = await TraktTVv2.trending(true)
        const data = trendingData.map(serie => {
          delete serie.ids
          delete serie.available_translations
          delete serie.title
          delete serie.tvrage_id
          delete serie.imdb_id
          delete serie.updated_at
          delete serie.aired_episodes
          delete serie.homepage
          delete serie.slug_id
          return serie
        })

        localStorage.setItem('trakttv.trending.cache', JSON.stringify(data))
        return true
      }
    }

    return service
  }
])

DuckieTV.run(['TraktTVUpdateService', 'SettingsService',
  function(TraktTVUpdateService, SettingsService) {
    var updateFunc = function() {
      var localDateTime = new Date().getTime()
      var tuPeriod = parseInt(SettingsService.get('trakt-update.period')) // TraktTV Update period in hours.
      if (!localStorage.getItem('trakttv.lastupdated')) {
        localStorage.setItem('trakttv.lastupdated', localDateTime)
      }

      var lastUpdated = new Date(parseInt(localStorage.getItem('trakttv.lastupdated')))
      if ((parseInt(localStorage.getItem('trakttv.lastupdated')) + (1000 * 60 * 60 * tuPeriod)) /* hours */ <= localDateTime) {
        TraktTVUpdateService.update(lastUpdated).then(function(count) {
          console.info('TraktTV update check completed. ' + count + ' shows updated since ' + lastUpdated)
          localStorage.setItem('trakttv.lastupdated', localDateTime)
        })
      } else {
        console.info('Not performing TraktTV update check. Already done within the last %s hour(s).', tuPeriod)
      }

      if (!localStorage.getItem('trakttv.lastupdated.trending')) {
        localStorage.setItem('trakttv.lastupdated.trending', 0)
      }

      if ((parseInt(localStorage.getItem('trakttv.lastupdated.trending')) + (1000 * 60 * 60 * 24 * 7)) /* 1 week */ < new Date().getTime()) {
        TraktTVUpdateService.updateCachedTrending().then(function() {
          console.info('TraktTV trending update completed. last updated:' + new Date(parseInt(localStorage.getItem('trakttv.lastupdated.trending'))).toString())
          localStorage.setItem('trakttv.lastupdated.trending', new Date().getTime())
        })
      } else {
        console.info('Not performing TraktTV trending update check. Last done ' + new Date(parseInt(localStorage.getItem('trakttv.lastupdated.trending'))).toString())
      }

      setTimeout(updateFunc, 1000 * 60 * 60 * tuPeriod) // schedule update check every tuPeriod hour(s) for long running apps.
    }

    setTimeout(updateFunc, 5000)
  }
])
;
/**
 * Trakt TV Sync interface.
 *
 * Reads and writes from and to trakt.tv
 */
DuckieTV.factory('TraktTVStorageSyncTarget', ['StorageSyncService', 'SettingsService', 'TraktTVv2',
  function(StorageSyncService, SettingsService, TraktTVv2) {
    var service = {
      name: 'TraktTV Sync Target',
      lastSync: 'never',
      status: 'idle',
      statusMessage: '',
      series: [],
      nonRemote: [],
      nonLocal: [],

      isEnabled: function() {
        return SettingsService.get('TraktTV.Sync')
      },
      enable: function() {
        SettingsService.set('TraktTV.Sync', true)
      },
      disable: function() {
        SettingsService.set('TraktTV.Sync', false)
      },
      getSeriesList: function() {
        service.status = 'reading'
        return TraktTVv2.watched().then(function(series) {
          series = series.map(function(el) {
            return parseInt(el.trakt_id)
          })
          service.status = 'idle'
          return series
        }, function(err) {
          service.status = 'read error'
          service.statusMessage = [err.status, err.statusText].join(' : ')
          return []
        })
      },
      write: function(series) {

      }
    }

    console.info('TraktTV storage sync target initialized!')
    return service
  }
]).run(['StorageSyncService',
  function(StorageSyncService) {
    StorageSyncService.registerTarget('TraktTVStorageSyncTarget')
  }
])
