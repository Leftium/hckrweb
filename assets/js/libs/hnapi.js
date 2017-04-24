(function(w){

	var date = function(){ return +new Date(); },
		supportXDomainRequest = !!w.XDomainRequest,
		supportCORS = 'withCredentials' in new XMLHttpRequest() || supportXDomainRequest,
		worker = false,
		timeout = 20000, // 20 seconds timeout
		requests = {};

	try {
		worker = new Worker('js/hnapi-worker.js');
		worker.addEventListener('message', function(e){
			var data = e.data,
				url = data.url || '';
			if (!requests[url]) return;
			var r = requests[url];
			var error = r.error;
			var success = r.success;
			delete requests[url];
			if (data.error){
				error(data.error);
			} else {
				success(data.response);
			}
		}, false);
	} catch (e){}

	var req = function(url, success, error){
		if (!success) success = function(){};
		if (!error) error = function(){};
		if (supportCORS){
			if (worker){
				requests[url] = {
					success: success,
					error: error
				};
				worker.postMessage({
					url: url,
					timeout: timeout
				});
			} else {
				var r = requests[url] || (supportXDomainRequest ? new XDomainRequest() : new XMLHttpRequest());
				if (r._timeout) clearTimeout(r._timeout);
				r._timeout = setTimeout(function(){
					r.abort();
				}, timeout);
				r.onload = function(){
					clearTimeout(this._timeout);
					delete requests[url];
					try {
						success(JSON.parse(this.responseText));
					} catch(e){
						error(e);
					}
				};
				r.onerror = r.onabort = r.ontimeout = function(e){
					clearTimeout(this._timeout);
					delete requests[url];
					error(e);
				};
				if (r.readyState <= 1 || supportXDomainRequest){ // XDomainRequest doesn't have readyState
					r.open('GET', url + '?' + date(), true);
					r.send();
				}
				requests[url] = r;
			}
		} else {
			// Very, very basic JSON-P fallback
			var d = w.document,
				s = d.createElement('script'),
				callback = 'callback' + date();
			w[callback] = success;
			s.onerror = error;
			s.src = url + '?callback=' + callback;
			d.body.appendChild(s);
		}
	};

	var urls = [
		'https://node-hnapi-eu.herokuapp.com/', // Heroku (EU)
		'https://node-hnapi.azurewebsites.net/', // Windows Azure (North EU)
		'https://node-hnapi-eus.azurewebsites.net/' // Windows Azure (East US)
		// '//node-hnapi-asia.azurewebsites.net/', // Windows Azure (East Asia)
		// '//node-hnapi-weu.azurewebsites.net/', // Windows Azure (West EU)
		// '//node-hnapi-wus.azurewebsites.net/', // Windows Azure (West US)
		// '//node-hnapi-ncus.azurewebsites.net/' // Windows Azure (North Central US)
	];
	var shuffle = function(array){ // Fisher-Yates
		for (var i = array.length - 1; i > 0; i--){
			var j = Math.floor(Math.random() * (i + 1));
			var temp = array[i];
			array[i] = array[j];
			array[j] = temp;
		}
	};
	shuffle(urls);
	urls.unshift('https://api.hackerwebapp.com/'); // The ultimate API

	var length = urls.length;
	var reqAgain = function(i, path, success, error){
		var errorFunc = (i < length-1) ? function(){
			reqAgain(i+1, path, success, error);
		} : error;
		req(urls[i] + path, success, errorFunc);
	};
	var reqs = function(path, success, error){
		req(urls[0] + path, success, function(){
			reqAgain(0, path, success, error);
		});
	};

	var hnapi = {

		urls: urls,

		_news: function(success, error){
			reqs('news', success, error);
		},

		_news2: function(success, error){
			reqs('news2', success, error);
		},

		item: function(id, success, error){
			reqs('item/' + id, success, error);
		},

		comments: function(id, success, error){
			reqs('comments/' + id, success, error);
		}

	};


    // from: http://www.learningjquery.com/2009/04/better-stronger-safer-jquerify-bookmarklet
    // more or less stolen form jquery core and adapted by paul irish
    function getScript(url,success) {
        var script=document.createElement('script');
        script.src=url;
        var head=document.getElementsByTagName('head')[0],
            done=false;
        // Attach handlers for all browsers
        script.onload=script.onreadystatechange = function(){
            if ( !done && (!this.readyState
                        || this.readyState == 'loaded'
                        || this.readyState == 'complete') ) {
                done=true;
                success();
                script.onload = script.onreadystatechange = null;
                head.removeChild(script);
            }
        };
        head.appendChild(script);
    }

    function to_hnapi(entry) {
        return {
            id: entry.id,
            title: entry.link_text,
            url: entry.link,
            domain: entry.source,
            points: entry.points,
            user: entry.submitter,
            time_ago: relativeDate(entry.date * 1000),
            comments_count: entry.comments,
            type: 'link'
        }
    };

    var hnapi_entries1 = [];
    var hnapi_entries2 = [];

    function process_entries(entries) {
        hnapi_entries1 = [];
        hnapi_entries2 = [];

        var now = Math.floor(new Date() / 1000);

        var last_visit = amplify.store('last_visit') || now;
        var num_visits = amplify.store('num_visits') || 0;

        num_visits++;

        amplify.store('last_visit', now);
        amplify.store('num_visits', num_visits);

        var i = 0;
        while ((i < entries.length) && (entries[i].date > last_visit)) {
            var hnapi_entry = to_hnapi(entries[i]);
            i++;
            hnapi_entry.i = i;
            hnapi_entries1.push(hnapi_entry);
        }

        hnapi_entries1.push({
            visit_count: num_visits,
            time_ago: relativeDate(last_visit * 1000),
            type: 'visit'
        });

        while (i < entries.length) {
            var hnapi_entry = to_hnapi(entries[i]);
            i++;
            hnapi_entry.i = i;
            hnapi_entries2.push(hnapi_entry);
        }
    }

    // Return new items since last last visit.
    hnapi.news = function(callback) {
        entries = null;
        getScript('//hckrnews.com/data/latest.js?' + date(), function() {
            if (entries) {
                process_entries(entries);
                callback(hnapi_entries1);
            } else {
                callback(null);
            }
        });
    }

    // Return remaining items before last visit.
    hnapi.news2 = function(callback) {
        if (entries) {
            callback(hnapi_entries2);
        } else {
            callback(null);
        }
    }






	w.hnapi = hnapi;

})(window);
