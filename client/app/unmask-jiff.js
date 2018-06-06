// Dependencies:
/*

<script src="/socket.io/socket.io.js"></script>
<script src="/bignumber.js/bignumber.min.js"></script>
<script src="/jiff/sodium.js"></script>
<script src="/jiff/jiff-client.js"></script>
<script src="/jiff/ext/jiff-client-bignumber.js"></script>

*/

// var masks: Array of form { fields: [], _id: user_id }
define([], function () {
  function reconstruct(session, masks, callback) {
    if (window.crypto == undefined) {
      window.crypto = window.msCrypto;
    }
    var hostname = window.location.href;
    hostname = hostname.substring(0, hostname.lastIndexOf("/"));

var mod = new BigNumber(2).pow(77).minus(451); // 77 bits
    var old_mod = new BigNumber("1099511627776"); // 2^40
    var jiff_instance;

    var options = {party_count: 1, party_id: 1, Zp: mod, autoConnect: false};
    options.onConnect = function (jiff_instance) {
      jiff_instance.emit('ready', ["s1"], session);

      jiff_instance.listen('begin', function (_, _) {
        // define order on keys
        var top_level_keys = [ "Amount spent with MBEs",  "Addressable spend",  "Number of MBEs"];
        var low_level_keys = {
         "Amount spent with MBEs": [ "DollarAmtLocal", "DollarAmtState", "DollarAmtNational" ],
         "Addressable spend": [ "TotalAmtLocal", "TotalAmtState", "TotalAmtNational" ],
         "Number of MBEs": [ "NumContractedLocal", "NumContractedState", "NumContractedNational" ]
        };

        // unmask
        var sums_per_key = null;
        function handle_one_party(n) {
          console.log("HANDLING PARTY ", n);
          var progress = document.getElementById('progress');
          progress.style.width = parseInt(100 / masks.length * n) + '%';
          progress.innerHTML = parseInt(100 / masks.length * n) + '%';
          // all is done, open results
          if(n >= masks.length) {
            // open the sum of every keys
            var promises = [];
            for (var i = 0; i < sums_per_key.length; i++)
              promises.push(jiff_instance.open(sums_per_key[i], [1]));

            // process
            Promise.all(promises).then(function (open_sums_per_key) {
              // convert format of result from a flat array to nested object with appropriate keys
              var final_result = {};
              var current_index = 0;
              for(var i = 0; i < top_level_keys.length; i++) {
                var top_key = top_level_keys[i];
                final_result[top_key] = {};
                for(var j = 0; j < low_level_keys[top_key].length; j++) {
                  var low_key = low_level_keys[top_key][j];
                  final_result[top_key][low_key] = { "value": open_sums_per_key[current_index].toString() };
                  current_index++;
                }
              }

              jiff_instance.disconnect();
              console.log(final_result);
              callback(final_result);
            });
            return;
          }

          // handle input party i
          var party_masks = [];
          for(var i = 0; i < top_level_keys.length; i++) {
            var top_key = top_level_keys[i];
            for(var j = 0; j < low_level_keys[top_key].length; j++) {
              var low_key = low_level_keys[top_key][j];
              party_masks.push(masks[n][top_key][low_key]);
            }
          }

          // Now party_masks has all masks for this party in order, share them
          var party_reconstructed = [];
          for(var i = 0; i < party_masks.length; i++) {
            var value_shares = jiff_instance.share(party_masks[i].value, 2, [1, "s1"], [1, "s1"]);
            var reconstructed_share = value_shares[1].sadd(value_shares["s1"]); // reconstruct under MPC
            var correction_factor = reconstructed_share.cgteq(old_mod, 73).cmult(old_mod); // 0 if no correction needed, 2^40 if correction needed
            reconstructed_share = reconstructed_share.ssub(correction_factor);
            party_reconstructed.push(reconstructed_share);
          }

          // filter if amount spent is too big
          var DollarAmtNational_share = party_reconstructed[5];
          var condition = DollarAmtNational_share.cgt(50000000, 33); // check if greater than 50,000,000
          for(var i = 0; i < 6; i++) { // fix first 6 answers (all dollar amounts)
            var current_share = party_reconstructed[i];
            var value_if_true = current_share.cdiv(1000, 33); // correct by removing three order of magnitude (this is integer division, floor)
            var value_if_false = current_share;
            var corrected_share = value_if_false.sadd(condition.smult(value_if_true.ssub(value_if_false)));
            party_reconstructed[i] = corrected_share;
          }


          if(n == 0) sums_per_key = party_reconstructed; // first party, keep it aside
          else { // not first party, add to sum so far
            for(var i = 0; i < party_reconstructed.length; i++)
              sums_per_key[i] = sums_per_key[i].sadd(party_reconstructed[i]);
          }

          var barrier_promises = [];
          for(var i = 0; i < sums_per_key.length; i++) {
            if(sums_per_key[i].promise != null)
              barrier_promises.push(sums_per_key[i].promise);
          }

          if(barrier_promises.length == 0) handle_one_party(n+1);
          else Promise.all(barrier_promises).then(function() { handle_one_party(n+1); });
        }

        handle_one_party(0);
      });
    }

    var base_instance = jiff.make_jiff(hostname, 'reconstruction-session', options);
    var jiff_instance = jiff_bignumber.make_jiff(base_instance, options)
    jiff_instance.connect();
  }

  return {reconstruct: reconstruct};
});
