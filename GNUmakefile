.PHONY: all clean clobber reload js

all: js

include vars.mk

clean:

clobber:
	-rm -rf build/

vars.mk: tools/vars.js
	node $< > $@

reload: vars.mk
	$(MAKE) -B vars.mk

BIN := $(shell npm bin)

js: $(DST_JS)

$(DST_JS): $(SRC_TS) $(SRC_JS)
	@mkdir -p $(dir $@)
	$(BIN)/webpack --progress --colors --config webpack.config.js
