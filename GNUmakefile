.PHONY: all reload-and-build reload clean clobber distribute js

include vars.mk

all: reload-and-build

reload-and-build: reload
	$(MAKE) js

reload:
	$(MAKE) -B vars.mk

clean:
	-rm -f vars.mk
	-rm -rf build/

clobber: clean
	-rm -rf dist/

distribute:
	mkdir -p dist/

js: $(DST_JS)

vars.mk: tools/vars.js
	node $< > $@

BIN := $(shell npm bin)

$(DST_JS): $(SRC_TS) $(SRC_JS)
	@mkdir -p $(dir $@)
	$(BIN)/webpack --progress --colors --config webpack.config.js
